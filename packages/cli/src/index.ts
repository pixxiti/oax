#!/usr/bin/env node
import * as path from "path";
import { Command } from "commander";
import * as fs from "fs/promises";
import { generateClient, parseOAS } from "./generator";
import { Pipeline, loadPipelineConfig } from "./pipeline";
import { discoverManifests, loadConfig, loadManifest, defaultConfigPath } from "./discovery";
import { generate, type GenerateResult } from "./generate";

const program = new Command();

program
  .name("oax")
  .description("A CLI tool to generate a typed API client from an OpenAPI Specification.")
  .version("1.0.0");

program
  .command("generate")
  .description("Generate clients from oax.manifest.ts files")
  .option("-c, --config <path>", "Path to the configuration file", "oax.config.ts")
  .option("--filter <name>", "Only generate manifests matching this name")
  .action(async (options) => {
    const projectRoot = process.cwd();
    const configPath = path.resolve(projectRoot, options.config);

    // Load config
    const config = await loadConfig(configPath);

    // Discover manifests
    const manifestPaths = discoverManifests(projectRoot);

    if (manifestPaths.length === 0) {
      console.log("No oax.manifest.ts files found.");
      return;
    }

    // Load all manifests
    const manifests = await Promise.all(
      manifestPaths.map(async (p) => ({
        path: p,
        manifest: await loadManifest(p),
      })),
    );

    const total = manifests.length;
    console.log(`\nGenerating clients from ${total} manifests...\n`);

    // Generate
    const results = await generate({
      projectRoot,
      ...(config != null ? { config } : {}),
      manifests,
      filter: options.filter,
    });

    // Report results
    const failures: GenerateResult[] = [];
    const padWidth = String(results.length).length;

    results.forEach((result, i) => {
      const counter = `[${String(i + 1).padStart(padWidth)}/${results.length}]`;
      const label = result.name.padEnd(24);

      if (result.status === "fulfilled") {
        const relOutput = path.relative(projectRoot, result.outputDir!);
        console.log(`  ${counter} ${label} -> ${relOutput}/`);
      } else {
        console.log(`  ${counter} ${label} FAILED`);
        failures.push(result);
      }
    });

    if (failures.length > 0) {
      console.error("");
      for (const f of failures) {
        console.error(`  ${f.name}: ${f.reason?.message ?? "Unknown error"}`);
      }
      console.error(`\n${failures.length} of ${results.length} manifests failed.`);
      process.exit(1);
    }

    console.log(`\nDone. ${results.length} clients generated.\n`);
  });

program
  .command("generate-file")
  .description("Generate a single API client file from an OpenAPI spec")
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

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, clientCode);
      console.log(`Successfully generated API client at ${outputPath}`);
    } catch (error) {
      console.error("Failed to generate API client:", error);
      process.exit(1);
    }
  });

program
  .command("build")
  .description("Run the pipeline defined in oax.config.ts")
  .option("-c, --config <path>", "Path to the configuration file", "oax.config.ts")
  .action(async (options) => {
    console.log("Building with pipeline...");
    console.log(`Config file: ${options.config}`);

    try {
      const config = await loadPipelineConfig(options.config);
      const pipeline = new Pipeline(config);
      await pipeline.run();
    } catch (error) {
      console.error("Failed to run pipeline:", error);
      process.exit(1);
    }
  });

program.parse(process.argv);
