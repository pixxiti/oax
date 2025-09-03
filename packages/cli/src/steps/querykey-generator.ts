import type { Step, StepContext, StepOutput } from "../pipeline";
import { format as prettierFormat } from "prettier";

export interface QueryKeyGeneratorOptions {
  /**
   * The step name to read the parsed OAS from
   * @default "oas-parser"
   */
  oasInputStep?: string;

  /**
   * Output file name
   * @default "querykeys.ts"
   */
  outputFile?: string;
}

/**
 * Step to generate query key functions and utilities
 */
export function queryKeyGenerator(options: QueryKeyGeneratorOptions = {}): Step {
  return {
    name: "querykey-generator",
    outputFile: options.outputFile || "querykeys.ts",
    async process(context: StepContext): Promise<StepOutput> {
      const oasInputStep = options.oasInputStep || "oas-parser";
      const oasData = context.previousOutputs[oasInputStep]?.content;

      if (!oasData) {
        throw new Error(
          `No output found from step "${oasInputStep}". Make sure the OAS parser step runs before this step.`
        );
      }

      // Extract operations from OAS
      const operations = extractOperationsFromOAS(oasData);
      
      // Generate query key functions
      const code = generateQueryKeyCode(operations);

      // Format the code
      const formattedCode = await prettierFormat(code, { parser: "typescript" });

      return {
        name: "querykeys",
        content: formattedCode,
        meta: {
          oasInputStep,
          operationCount: operations.length,
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

function generateQueryKeyCode(operations: OperationInfo[]): string {
  const operationIds = operations.map(op => `'${op.operationId}'`).join(' | ');
  
  // Generate imports and types first
  const imports = `import type { z } from "zod";
import type { Operations } from "./schemas";`;

  // Generate individual operation query key functions (simplified)
  const operationQueryKeys = operations
    .map((op) => {
      return `export function ${op.operationId}QueryKey<
  TParams extends Partial<z.infer<Operations['${op.operationId}']['params']>> = Record<string, never>,
  TQueries extends Partial<z.infer<Operations['${op.operationId}']['queries']>> = Record<string, never>
>(
  params?: TParams,
  queries?: TQueries
): readonly ['${op.operationId}', TParams?, TQueries?] {
  const key: readonly ['${op.operationId}', TParams?, TQueries?] = ['${op.operationId}'];
  if (params !== undefined) {
    (key as any).push(params);
    if (queries !== undefined) {
      (key as any).push(queries);
    }
  } else if (queries !== undefined) {
    (key as any).push(undefined, queries);
  }
  return key;
}`;
    })
    .join('\n\n');

  // Simplified utilities - all as individual exports for tree-shaking
  const utilities = `
export type OperationId = ${operationIds};

/**
 * Get all keys that match the operation ID (useful for invalidation)
 */
export function createOperationKey(operationId: OperationId) {
  return [operationId] as const;
}

/**
 * Get keys with operation ID and params (useful for partial invalidation)
 */
export function createOperationWithParamsKey<T extends OperationId>(
  operationId: T, 
  params: Partial<z.infer<Operations[T]['params']>>
) {
  return [operationId, params] as const;
}

/**
 * Get exact keys with operation ID, params, and queries (for exact matching)
 */
export function createExactKey<T extends OperationId>(
  operationId: T, 
  params?: Partial<z.infer<Operations[T]['params']>>, 
  queries?: Partial<z.infer<Operations[T]['queries']>>
) {
  if (queries !== undefined) {
    return [operationId, params, queries] as const;
  }
  if (params !== undefined) {
    return [operationId, params] as const;
  }
  return [operationId] as const;
}

/**
 * Type-safe query key factory
 */
export type QueryKeyFactory<T extends OperationId> = T extends 'listPets' ? typeof listPetsQueryKey : T extends 'createPet' ? typeof createPetQueryKey : T extends 'getPetById' ? typeof getPetByIdQueryKey : never;

/**
 * Infer query key type from operation ID
 */
export type QueryKey<T extends OperationId> = ReturnType<QueryKeyFactory<T>>;`;

  return `${imports}

${operationQueryKeys}
${utilities}`;
}