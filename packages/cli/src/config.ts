import type { PipelineConfig, Step } from "./pipeline";

export interface ConfigDefinition {
  /**
   * Output directory for generated files
   * @default "oax"
   */
  outputDir?: string;

  /**
   * Input file (typically an OAS specification)
   */
  input?: string;

  /**
   * Pipeline steps to execute
   */
  steps: Step[];
}

/**
 * Creates a pipeline configuration
 */
export function defineConfig(config: ConfigDefinition): PipelineConfig {
  const result: PipelineConfig = {
    outputDir: config.outputDir || "oax",
    steps: config.steps,
  };

  if (config.input) {
    result.input = config.input;
  }

  return result;
}

/**
 * Helper to create a custom step
 */
export function defineStep(step: Step): Step {
  return step;
}

// Example configuration structure for documentation
export const exampleConfig: ConfigDefinition = {
  outputDir: "generated",
  input: "api.json",
  steps: [
    {
      name: "parse-oas",
      outputFile: "parsed.json",
      async process(context) {
        // Custom parsing logic
        const oasContent = context.inputs["api.json"]?.content;
        return {
          name: "parsed-oas",
          content: oasContent,
        };
      },
    },
    {
      name: "generate-zod",
      outputFile: "schemas.ts",
      async process(context) {
        // Generate Zod schemas from parsed OAS data
        const oasData = context.previousOutputs["parse-oas"]?.content;
        console.log("Generating schemas from:", oasData?.info?.title || "Unknown API");
        return {
          name: "zod-schemas",
          content: "// Generated Zod schemas",
        };
      },
    },
  ],
};
