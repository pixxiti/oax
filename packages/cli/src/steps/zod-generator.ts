import type { Step, StepContext, StepOutput } from "../pipeline";
import { generateZodSchemas, generateSchemaCode, generateOperations, generateOperationsCode } from "../generator";
import { format as prettierFormat } from "prettier";

export interface ZodGeneratorOptions {
  /**
   * The step name to read the parsed OAS from
   * @default "oas-parser"
   */
  inputStep?: string;

  /**
   * Output file name
   * @default "schemas.ts"
   */
  outputFile?: string;
}

/**
 * Step to generate Zod schemas from a parsed OAS specification
 */
export function zodGenerator(options: ZodGeneratorOptions = {}): Step {
  return {
    name: "zod-generator",
    outputFile: options.outputFile || "schemas.ts",
    async process(context: StepContext): Promise<StepOutput> {
      const inputStep = options.inputStep || "oas-parser";
      const oasData = context.previousOutputs[inputStep]?.content;

      if (!oasData) {
        throw new Error(
          `No output found from step "${inputStep}". Make sure the OAS parser step runs before this step.`
        );
      }

      // Generate Zod schemas and operations using existing generator logic
      const schemas = generateZodSchemas(oasData);
      const operations = generateOperations(oasData);
      const schemaCode = generateSchemaCode(schemas);
      const operationsCode = generateOperationsCode(operations);

      const fullCode = `import { z } from 'zod';

${schemaCode}

${operationsCode}`;

      // Format the code
      const formattedCode = await prettierFormat(fullCode, { parser: "typescript" });

      return {
        name: "zod-schemas-and-operations",
        content: formattedCode,
        meta: {
          inputStep,
          schemaCount: schemas.length,
          operationCount: operations.length,
          schemas: schemas.reduce((acc, schema) => {
            acc[schema.name] = schema;
            return acc;
          }, {} as Record<string, any>),
          operations: operations.reduce((acc, op) => {
            acc[op.operationId] = op;
            return acc;
          }, {} as Record<string, any>),
          generatedAt: new Date().toISOString(),
        },
      };
    },
  };
}
