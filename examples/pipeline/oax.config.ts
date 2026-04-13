import { definePipelineConfig } from "@pixxiti/oax-cli/config";
import { createStandardPipeline } from "@pixxiti/oax-cli/steps";

export default definePipelineConfig({
  outputDir: "generated",
  input: "../../packages/cli/tests/fixtures/petstore.json",
  steps:  createStandardPipeline("../../packages/cli/tests/fixtures/petstore.json"),
});