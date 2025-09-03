import { format as prettierFormat } from "prettier";
import type { Step, StepContext, StepOutput } from "../pipeline";

export interface ReactQueryGeneratorOptions {
  /**
   * The step name to read the parsed OAS from
   * @default "oas-parser"
   */
  oasInputStep?: string;

  /**
   * The step name to read the Ky client from
   * @default "ky-generator"
   */
  clientInputStep?: string;

  /**
   * The step name to read the query keys from
   * @default "querykey-generator"
   */
  queryKeyInputStep?: string;

  /**
   * The step name to read the schemas from
   * @default "zod-generator"
   */
  schemaInputStep?: string;

  /**
   * Output file name
   * @default "hooks.ts"
   */
  outputFile?: string;
}

/**
 * Step to generate React Query hooks from operations
 */
export function reactQueryGenerator(options: ReactQueryGeneratorOptions = {}): Step {
  return {
    name: "react-query-generator",
    outputFile: options.outputFile || "hooks.ts",
    async process(context: StepContext): Promise<StepOutput> {
      const oasInputStep = options.oasInputStep || "oas-parser";
      const clientInputStep = options.clientInputStep || "ky-generator";
      const queryKeyInputStep = options.queryKeyInputStep || "querykey-generator";
      const schemaInputStep = options.schemaInputStep || "zod-generator";

      const oasData = context.previousOutputs[oasInputStep]?.content;
      const clientCode = context.previousOutputs[clientInputStep]?.content;
      const queryKeyCode = context.previousOutputs[queryKeyInputStep]?.content;
      const schemaCode = context.previousOutputs[schemaInputStep]?.content;

      if (!oasData) {
        throw new Error(
          `No output found from step "${oasInputStep}". Make sure the OAS parser step runs before this step.`
        );
      }

      if (!clientCode) {
        throw new Error(
          `No output found from step "${clientInputStep}". Make sure the client generator step runs before this step.`
        );
      }

      if (!queryKeyCode) {
        throw new Error(
          `No output found from step "${queryKeyInputStep}". Make sure the query key generator step runs before this step.`
        );
      }

      if (!schemaCode) {
        throw new Error(
          `No output found from step "${schemaInputStep}". Make sure the schema generator step runs before this step.`
        );
      }

      // Generate React Query hooks based on operations
      const operations = extractOperationsFromOAS(oasData);
      const operationsData = extractOperationsFromSchemaCode(schemaCode);
      const { hooksCode, clientImports, schemaImports } = generateReactQueryHooks(operations, operationsData);

      // Generate query key imports (only for operations that will be used)
      const queryKeyImports = operations
        .filter(op => op.method.toLowerCase() === 'get') // Only queries use query keys
        .map(op => `${op.operationId}QueryKey`)
        .join(', ');

      const fullCode = `import { useQuery, useMutation } from '@tanstack/react-query';
import type { UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';
import type { HTTPError } from 'ky';
import type { z } from 'zod';
${clientImports}
${schemaImports}
import { ${queryKeyImports} } from './querykeys';

${hooksCode}`;

      // Format the code
      const formattedCode = await prettierFormat(fullCode, { parser: "typescript" });

      return {
        name: "react-query-hooks",
        content: formattedCode,
        meta: {
          oasInputStep,
          clientInputStep,
          queryKeyInputStep,
          hookCount: operations.length,
          generatedAt: new Date().toISOString(),
        },
      };
    },
  };
}

interface OperationInfo {
  operationId: string;
  method: string;
  path: string;
  parameters: ParameterInfo[];
}

interface ParameterInfo {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
}

interface OperationTypeInfo {
  operationId: string;
  method: string;
  paramsType?: string | undefined;
  queriesType?: string | undefined;
  requestBodyType?: string | undefined;
  responseType?: string;
}

function extractOperationsFromOAS(oasData: any): OperationInfo[] {
  const operations: OperationInfo[] = [];

  if (!oasData.paths) return operations;

  for (const [path, pathItem] of Object.entries(oasData.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    const methods = ["get", "post", "put", "delete", "patch", "head", "options"];

    for (const method of methods) {
      const operation = (pathItem as any)[method];
      if (!operation) continue;

      const operationId = operation.operationId || `${method}${path.replace(/[^a-zA-Z0-9]/g, "")}`;

      const parameters: ParameterInfo[] = [];
      if (operation.parameters) {
        for (const param of operation.parameters) {
          if ("$ref" in param) continue; // Skip refs for now

          parameters.push({
            name: param.name,
            in: param.in,
            required: param.required || false,
          });
        }
      }

      operations.push({
        operationId,
        method,
        path,
        parameters,
      });
    }
  }

  return operations;
}

function extractOperationsFromSchemaCode(schemaCode: string): Map<string, OperationTypeInfo> {
  const operationsMap = new Map<string, OperationTypeInfo>();
  
  // Parse the operations object from the schema code
  const operationsMatch = schemaCode.match(/export const operations = \{([\s\S]*?)\} as const;/);
  if (!operationsMatch) return operationsMap;

  // Extract individual operations using regex patterns
  const operationPattern = /(\w+):\s*\{[\s\S]*?method:\s*["'](\w+)["'][\s\S]*?operationId:\s*["'](\w+)["'][\s\S]*?params:\s*z\.object\(([\s\S]*?)\)[\s\S]*?queries:\s*z\.object\(([\s\S]*?)\)[\s\S]*?(?:requestBody:\s*\{\s*schema:\s*(\w+)[\s\S]*?\}[\s\S]*?)?responses:\s*\{[\s\S]*?["'](?:200|201)["']:\s*\{[\s\S]*?schema:\s*([^,\s}]+)/g;
  
  let match;
  match = operationPattern.exec(operationsMatch[1] ?? '');
  while (match !== null) {
    if (!match) continue;
    const [, , method, operationId, paramsContent, queriesContent, requestBodyType] = match;
    if (!operationId) continue;
    if (!method) continue;
    
    const hasParams = paramsContent?.trim() !== '';
    const hasQueries = queriesContent?.trim() !== '';
    
    // Determine the actual response status code for this operation
    let responseStatusCode = '200';
    if (method?.toLowerCase() === 'post') {
      responseStatusCode = '201';
    }
    
    const responseType = `z.infer<(typeof operations.${operationId}.responses)['${responseStatusCode}']['schema']>`;
    
    operationsMap.set(operationId, {
      operationId,
      method,
      paramsType: hasParams ? `z.infer<typeof operations.${operationId}.params>` : undefined,
      queriesType: hasQueries ? `z.infer<typeof operations.${operationId}.queries>` : undefined,
      requestBodyType: requestBodyType ? `z.infer<typeof ${requestBodyType}>` : undefined,
      responseType,
    });
    
    // Get next match
    match = operationPattern.exec(operationsMatch[1] ?? '');
  }

  return operationsMap;
}

function generateReactQueryHooks(operations: OperationInfo[], operationsTypeMap: Map<string, OperationTypeInfo>): { hooksCode: string; clientImports: string; schemaImports: string } {
  const hooks: string[] = [];
  const importedFunctions = new Set<string>();
  const importedSchemas = new Set<string>();

  for (const op of operations) {
    const hookName = `use${op.operationId.charAt(0).toUpperCase()}${op.operationId.slice(1)}`;
    importedFunctions.add(op.operationId);

    const typeInfo = operationsTypeMap.get(op.operationId);
    const pathParams = op.parameters.filter((p) => p.in === "path");
    const queryParams = op.parameters.filter((p) => p.in === "query");
    
    const hasPathParams = pathParams.length > 0;
    const hasQueryParams = queryParams.length > 0;

    if (op.method.toLowerCase() === "get") {
      // Generate useQuery hook with proper types
      let parameterTypes = "";
      let queryKeyCall = "";
      const returnType = typeInfo?.responseType || 'unknown';

      if (!hasPathParams && !hasQueryParams) {
        // No parameters
        parameterTypes = `options?: Omit<UseQueryOptions<${returnType}, HTTPError>, 'queryKey' | 'queryFn'>`;
        queryKeyCall = `${op.operationId}QueryKey()`;
      } else if (hasPathParams && !hasQueryParams) {
        // Only path params
        const paramsType = typeInfo?.paramsType || 'any';
        parameterTypes = `params: ${paramsType}, options?: Omit<UseQueryOptions<${returnType}, HTTPError>, 'queryKey' | 'queryFn'>`;
        queryKeyCall = `${op.operationId}QueryKey(params)`;
      } else if (!hasPathParams && hasQueryParams) {
        // Only query params
        const queriesType = typeInfo?.queriesType || 'any';
        parameterTypes = `params?: undefined, queries?: ${queriesType}, options?: Omit<UseQueryOptions<${returnType}, HTTPError>, 'queryKey' | 'queryFn'>`;
        queryKeyCall = `${op.operationId}QueryKey(params, queries)`;
      } else {
        // Both path and query params
        const paramsType = typeInfo?.paramsType || 'any';
        const queriesType = typeInfo?.queriesType || 'any';
        parameterTypes = `params: ${paramsType}, queries?: ${queriesType}, options?: Omit<UseQueryOptions<${returnType}, HTTPError>, 'queryKey' | 'queryFn'>`;
        queryKeyCall = `${op.operationId}QueryKey(params, queries)`;
      }

      hooks.push(`
export function ${hookName}(${parameterTypes}) {
  return useQuery({
    queryKey: ${queryKeyCall},
    queryFn: () => ${op.operationId}(${hasPathParams || hasQueryParams ? "params" : ""}),
    ...options,
  });
}`);
    } else {
      // Generate useMutation hook with proper types
      const requestType = typeInfo?.requestBodyType || 'any';
      const returnType = typeInfo?.responseType || 'unknown';
      
      // Track schema imports needed for mutations
      if (typeInfo?.requestBodyType && !typeInfo.requestBodyType.includes('operations.')) {
        const schemaMatch = typeInfo.requestBodyType.match(/z\.infer<typeof (\w+)>/);
        if (schemaMatch?.[1]) {
          importedSchemas.add(schemaMatch[1]);
        }
      }
      
      hooks.push(`
export function ${hookName}(
  options?: UseMutationOptions<${returnType}, HTTPError, ${requestType}>
) {
  return useMutation({
    mutationFn: (data: ${requestType}) => ${op.operationId}(data),
    ...options,
  });
}`);
    }
  }

  const clientImports = `import { ${Array.from(importedFunctions).join(', ')} } from './client'`;
  
  let schemaImports = 'import type { operations';
  if (importedSchemas.size > 0) {
    schemaImports += `, ${Array.from(importedSchemas).join(', ')}`;
  }
  schemaImports += " } from './schemas';";
  
  return {
    hooksCode: hooks.join("\n"),
    clientImports,
    schemaImports
  };
}
