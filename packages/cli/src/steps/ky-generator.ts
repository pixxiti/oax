import { format as prettierFormat } from "prettier";
import type { Step, StepContext, StepOutput } from "../pipeline";

interface OperationInfo {
  operationId: string;
  method: string;
  path: string;
  parameters: ParameterInfo[];
  requestBody?: SchemaReference;
  responses: ResponseInfo[];
  summary?: string;
  description?: string;
}

interface ParameterInfo {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: SchemaReference;
}

interface ResponseInfo {
  status: string;
  description?: string;
  schema?: SchemaReference;
}

interface SchemaReference {
  zodCode: string;
  required: boolean;
}

function generateKyFunction(operation: OperationInfo): string {
  const { operationId, method, path, parameters, requestBody, responses } = operation;

  // Extract path parameters
  const pathParams = parameters.filter((p) => p.in === "path");
  const queryParams = parameters.filter((p) => p.in === "query");
  const headerParams = parameters.filter((p) => p.in === "header");

  // Build function parameters
  const functionParams: string[] = [];

  // Path parameters
  if (pathParams.length > 0) {
    const pathParamType = pathParams.map((p) => `${p.name}: string`).join(", ");
    functionParams.push(`params: { ${pathParamType} }`);
  }

  // Query parameters
  if (queryParams.length > 0) {
    const queryParamType = queryParams
      .map((p) => `${p.name}${p.required ? "" : "?"}: ${getTypeFromZodCode(p.schema.zodCode)}`)
      .join(", ");
    functionParams.push(`queries?: { ${queryParamType} }`);
  }

  // Request body
  if (requestBody) {
    const bodyType = getTypeFromZodCode(requestBody.zodCode);
    functionParams.push(`body${requestBody.required ? "" : "?"}: ${bodyType}`);
  }

  // Options parameter
  functionParams.push("options?: RequestInit");

  // Build path replacement logic
  let pathReplacement = path;
  if (pathParams.length > 0) {
    for (const param of pathParams) {
      pathReplacement = pathReplacement.replace(`{${param.name}}`, `\${params.${param.name}}`);
    }
    pathReplacement = `\`${pathReplacement}\``;
  } else {
    pathReplacement = `'${path}'`;
  }

  // Build ky call with validation support
  const kyMethod = method.toLowerCase();
  const kyOptions: string[] = [];

  // Add operationId for validation hooks
  kyOptions.push(`operationId: '${operationId}'`);

  // Add inputs for validation
  const hasInputs = pathParams.length > 0 || queryParams.length > 0 || headerParams.length > 0;
  if (hasInputs) {
    const inputParts: string[] = [];
    if (pathParams.length > 0) inputParts.push("params");
    if (queryParams.length > 0) inputParts.push("queries");
    if (headerParams.length > 0) inputParts.push("headers");
    kyOptions.push(`inputs: { ${inputParts.join(", ")} }`);
  }

  if (queryParams.length > 0) {
    kyOptions.push("searchParams: queries");
  }

  if (requestBody) {
    kyOptions.push("json: body");
  }

  if (headerParams.length > 0) {
    const headerObj = headerParams.map((h) => `'${h.name}': headers?.${h.name}`).join(", ");
    kyOptions.push(`headers: { ${headerObj} }`);
  }

  kyOptions.push("...options");

  const kyOptionsStr = kyOptions.length > 0 ? `{ ${kyOptions.join(", ")} }` : "";

  // Determine return type from responses
  const successResponse = responses.find((r) => r.status.startsWith("2"));
  const returnType = successResponse?.schema
    ? getTypeFromZodCode(successResponse.schema.zodCode)
    : "void";

  return `export async function ${operationId}(${functionParams.join(", ")}): Promise<${returnType}> {
  const kyInstance = getValidatedKyInstance();
  const response = await kyInstance.${kyMethod}(${pathReplacement}${kyOptionsStr ? `, ${kyOptionsStr} as any` : ""});
  ${returnType === "void" ? "return;" : "return response.json();"}
}`;
}

function getTypeFromZodCode(zodCode: string): string {
  // Simple mapping from zod types to TypeScript types
  // This is a basic implementation - you might want to make it more sophisticated
  if (zodCode.includes("z.string()")) return "string";
  if (zodCode.includes("z.number()")) return "number";
  if (zodCode.includes("z.boolean()")) return "boolean";
  if (zodCode.includes("z.array(")) {
    const innerType = zodCode.match(/z\.array\((.+)\)/)?.[1];
    return `Array<${innerType ? getTypeFromZodCode(innerType) : "any"}>`;
  }

  // For schema references (like Pet, NewPet), extract the name
  const schemaMatch = zodCode.match(/^([A-Z][a-zA-Z0-9_]*)$/);
  if (schemaMatch) {
    return `z.infer<typeof ${schemaMatch[1]}>`;
  }

  return "any";
}

function extractUsedSchemasFromFunctions(functionsCode: string): string[] {
  const usedSchemas: string[] = [];

  // Match z.infer<typeof SchemaName> patterns
  const schemaMatches = functionsCode.match(/z\.infer<typeof\s+([A-Z][a-zA-Z0-9_]*)/g);

  if (schemaMatches) {
    for (const match of schemaMatches) {
      const schemaName = match.match(/z\.infer<typeof\s+([A-Z][a-zA-Z0-9_]*)/)?.[1];
      if (schemaName && !usedSchemas.includes(schemaName)) {
        usedSchemas.push(schemaName);
      }
    }
  }

  return usedSchemas.sort();
}

export interface KyGeneratorOptions {
  /**
   * The step name to read the schemas and operations from
   * @default "zod-generator"
   */
  inputStep?: string;

  /**
   * Output file name
   * @default "client.ts"
   */
  outputFile?: string;
}

/**
 * Step to generate individual Ky functions from schemas and operations
 */
export function kyGenerator(options: KyGeneratorOptions = {}): Step {
  return {
    name: "ky-generator",
    outputFile: options.outputFile || "client.ts",
    async process(context: StepContext): Promise<StepOutput> {
      const inputStep = options.inputStep || "zod-generator";
      const zodOutput = context.previousOutputs[inputStep];

      if (!zodOutput) {
        throw new Error(
          `No output found from step "${inputStep}". Make sure the Zod generator step runs before this step.`
        );
      }

      const operations = zodOutput.meta?.operations;
      if (!operations) {
        throw new Error(
          `No operations found in step "${inputStep}". Make sure the Zod generator includes operations.`
        );
      }

      // Generate individual ky functions
      const kyFunctions = Object.values(operations as Record<string, OperationInfo>)
        .map((op) => {
          return generateKyFunction(op);
        })
        .join("\n\n");

      // Extract used schemas from the functions
      const usedSchemas = extractUsedSchemasFromFunctions(kyFunctions);
      const schemaImports =
        usedSchemas.length > 0 ? `import type { ${usedSchemas.join(", ")} } from './schemas';` : "";

      const clientCode = `import type { z } from 'zod';
import { getValidatedKyInstance, configureClient, type ValidatedKyClientOptions } from './validator-client';
${schemaImports}

// Re-export for convenience
export { configureClient, type ValidatedKyClientOptions };

${kyFunctions}`;

      // Format the code
      const formattedCode = await prettierFormat(clientCode, { parser: "typescript" });

      return {
        name: "ky-client",
        content: formattedCode,
        meta: {
          inputStep,
          operationCount: Object.keys(operations).length,
          generatedAt: new Date().toISOString(),
        },
      };
    },
  };
}
