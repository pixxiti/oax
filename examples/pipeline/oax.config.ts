import { definePipelineConfig } from "../../packages/cli/src/config";
import { createStandardPipeline } from "../../packages/cli/src/steps";

export default definePipelineConfig({
  outputDir: "generated",
  input: "../../packages/cli/tests/fixtures/petstore.json",
  steps:  createStandardPipeline("../../packages/cli/tests/fixtures/petstore.json"),
});