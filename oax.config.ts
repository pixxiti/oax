import { definePipelineConfig } from "./packages/cli/src/config";
import { oasParser, zodGenerator, kyGenerator, queryKeyGenerator, reactQueryGenerator } from "./packages/cli/src/steps";

export default definePipelineConfig({
  outputDir: "generated",
  input: "packages/cli/tests/fixtures/petstore.json",
  steps: [
    oasParser(),
    zodGenerator(),
    kyGenerator(),
    queryKeyGenerator(),
    reactQueryGenerator(),
  ],
});