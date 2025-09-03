import { parseOAS } from "../generator";
import type { Step, StepContext, StepOutput } from "../pipeline";

export interface OASParserOptions {
  /**
   * The input file key to read the OAS specification from
   */
  input?: string;

  /**
   * Output file name. If not provided, output will be context-only (not written to file)
   */
  outputFile?: string;
}

/**
 * Step to parse an OpenAPI Specification file
 */
export function oasParser(options: OASParserOptions = {}): Step {
  const step: Step = {
    name: "oas-parser",
    async process(context: StepContext): Promise<StepOutput> {
      // Find the OAS input
      let oasInput: any;

      if (options.input) {
        oasInput = context.inputs[options.input]?.content;
        if (!oasInput) {
          throw new Error(`Input "${options.input}" not found`);
        }
      } else {
        // Look for any JSON/YAML input that might be an OAS
        const inputKeys = Object.keys(context.inputs);
        if (inputKeys.length === 0) {
          throw new Error("No input files found");
        }

        // Use the first available input
        const firstKey = inputKeys[0];
        if (firstKey) {
          oasInput = context.inputs[firstKey]?.content;
        }
      }

      // Parse the OAS specification
      let parsedOAS: any;

      if (typeof oasInput === "string") {
        // If it's a file path, parse it
        parsedOAS = await parseOAS(oasInput);
      } else {
        // If it's already an object, use it directly
        parsedOAS = oasInput;
      }

      return {
        name: "parsed-oas",
        content: parsedOAS,
        meta: {
          originalInput: options.input,
          title: parsedOAS.info?.title,
          version: parsedOAS.info?.version,
        },
      };
    },
  };
  
  if (options.outputFile) {
    step.outputFile = options.outputFile;
  }
  
  return step;
}
