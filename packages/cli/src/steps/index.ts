// Built-in pipeline steps
export { oasParser, type OASParserOptions } from "./oas-parser";
export { zodGenerator, type ZodGeneratorOptions } from "./zod-generator";
export { kyInitializer, type KyInitializerOptions } from "./ky-initializer";
export { validatorPipeline, type ValidatorPipelineOptions } from "./validator-pipeline";
export { kyGenerator, type KyGeneratorOptions } from "./ky-generator";
export { queryKeyGenerator, type QueryKeyGeneratorOptions } from "./querykey-generator";
export { reactQueryGenerator, type ReactQueryGeneratorOptions } from "./react-query-generator";

// Convenience function to create a common pipeline
import { oasParser } from "./oas-parser";
import { zodGenerator } from "./zod-generator";
import { kyInitializer } from "./ky-initializer";
import { validatorPipeline } from "./validator-pipeline";
import { kyGenerator } from "./ky-generator";
import { queryKeyGenerator } from "./querykey-generator";
import { reactQueryGenerator } from "./react-query-generator";

export function createStandardPipeline(input: string) {
  return [
    oasParser({ input }),
    zodGenerator(),
    kyInitializer(),
    validatorPipeline(),
    kyGenerator(),
    queryKeyGenerator(),
    reactQueryGenerator()
  ];
}
