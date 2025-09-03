#!/usr/bin/env node
import * as path from "path";
import { Command } from "commander";
import * as fs from "fs/promises";
import { generateClient, parseOAS } from "./generator";
import { Pipeline, loadPipelineConfig } from "./pipeline";

const program = new Command();

program
  .name("oax")
  .description("A CLI tool to generate a typed API client from an OpenAPI Specification.")
  .version("1.0.0");

program
  .command("generate")
  .description("Generate a new API client")
  .requiredOption("-i, --input <path>", "Path to the OpenAPI Specification file")
  .requiredOption("-o, --output <path>", "Path to generate the API client")
  .action(async (options) => {
    console.log("Generating API client...");
    console.log(`Input file: ${options.input}`);
    console.log(`Output path: ${options.output}`);

    try {
      const oas = await parseOAS(options.input);
      const clientCode = await generateClient(oas);
      const outputPath = path.resolve(process.cwd(), options.output);

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      await fs.writeFile(outputPath, clientCode);
      console.log(`✅ Successfully generated API client at ${outputPath}`);
    } catch (error) {
      console.error("❌ Failed to generate API client:", error);
      process.exit(1);
    }
  });

program
  .command("build")
  .description("Run the pipeline defined in oax.config.ts")
  .option("-c, --config <path>", "Path to the configuration file", "oax.config.ts")
  .action(async (options) => {
    console.log("🔧 Building with pipeline...");
    console.log(`Config file: ${options.config}`);

    try {
      const config = await loadPipelineConfig(options.config);
      const pipeline = new Pipeline(config);
      await pipeline.run();
    } catch (error) {
      console.error("❌ Failed to run pipeline:", error);
      process.exit(1);
    }
  });

program.parse(process.argv);
