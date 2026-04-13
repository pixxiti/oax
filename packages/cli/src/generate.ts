import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseOAS } from "./generator";
import { generateSchemasFile } from "./lib";
import {
  type BuildOptions,
  type Config,
  DEFAULT_BUILD_OPTIONS,
  type Manifest,
  type ManifestInput,
  resolveManifest,
} from "./manifest";
import { filterSpec, mergeSpecs, resolveSpecPath, runPreprocessor } from "./spec-resolver";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ManifestEntry {
  path: string;
  manifest: Manifest;
}

export interface GenerateOptions {
  projectRoot: string;
  config?: Config;
  manifests: ManifestEntry[];
  filter?: string;
}

export interface GenerateResult {
  status: "fulfilled" | "rejected";
  name: string;
  manifestPath: string;
  outputDir?: string;
  reason?: Error;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mergeOptions(
  configOptions: BuildOptions,
  manifestOptions?: BuildOptions
): Required<BuildOptions> {
  return {
    ...DEFAULT_BUILD_OPTIONS,
    ...configOptions,
    ...manifestOptions,
  } as Required<BuildOptions>;
}

// ─── Process single manifest ────────────────────────────────────────────────

async function processManifest(
  entry: ManifestEntry,
  config: Config | undefined,
  projectRoot: string
): Promise<{ name: string; outputDir: string }> {
  // Resolve manifest (call function or use object)
  let resolved: ManifestInput;
  if (typeof entry.manifest.input === "function") {
    if (!config) {
      throw new Error(
        `Manifest at ${entry.path} uses function form but no oax.config.ts was found. Use the object form of defineManifest or create an oax.config.ts with your sources.`
      );
    }
    resolved = resolveManifest(entry.manifest, config.sources);
  } else {
    resolved = resolveManifest(entry.manifest, config?.sources ?? {});
  }

  // Merge options: defaults <- config <- manifest
  const options = mergeOptions(config?.options ?? {}, resolved.options);

  const manifestDir = path.dirname(entry.path);
  const outputDir = path.join(manifestDir, options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oax-gen-"));

  try {
    // Run preprocessors
    for (const source of resolved.sources) {
      if (source.preprocessor) {
        runPreprocessor(source.preprocessor, projectRoot);
      }
    }

    // Resolve spec: single or multi-source
    let specPath: string;
    let isTempSpec = false;

    if (resolved.sources.length > 1) {
      // Multi-source: resolve paths, then merge
      const resolvedSources = resolved.sources.map((s) => ({
        ...s,
        path: resolveSpecPath(s.path, projectRoot),
      }));
      specPath = mergeSpecs(resolvedSources, tmpDir);
      isTempSpec = true;
    } else {
      const source = resolved.sources[0];
      if (!source) throw new Error(`Manifest "${resolved.name}" has no sources`);
      specPath = resolveSpecPath(source.path, projectRoot);

      if (source.filter) {
        specPath = filterSpec(specPath, source.filter, tmpDir);
        isTempSpec = true;
      }
    }

    // Generate
    const oas = await parseOAS(specPath);
    const code = await generateSchemasFile(oas, {
      zodVersion: options.zodVersion,
      strictObjects: options.strictObjects,
      additionalPropsDefault: options.additionalPropsDefault,
      mediaTypeExpr: options.mediaTypeExpr,
    });

    // Write output
    const outputPath = path.join(outputDir, options.outputFile);
    fs.writeFileSync(outputPath, code);

    // Cleanup temp spec
    if (isTempSpec) {
      fs.unlinkSync(specPath);
    }

    return { name: resolved.name, outputDir };
  } finally {
    // Cleanup temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Main generate function ─────────────────────────────────────────────────

/**
 * Generates typed Zod clients from manifests.
 * Processes all manifests in parallel, collecting results.
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult[]> {
  const { projectRoot, config, filter } = options;

  // Apply name filter
  let manifests = options.manifests;
  if (filter) {
    manifests = manifests.filter((entry) => {
      const resolved =
        typeof entry.manifest.input === "function"
          ? entry.manifest.input({ sources: config?.sources ?? {} })
          : entry.manifest.input;
      return resolved.name === filter;
    });
  }

  const settled = await Promise.allSettled(
    manifests.map((entry) => processManifest(entry, config, projectRoot))
  );

  return settled.map((result, i) => {
    const entry = manifests[i];
    if (!entry) throw new Error("Unexpected: manifest entry missing");
    if (result.status === "fulfilled") {
      return {
        status: "fulfilled" as const,
        name: result.value.name,
        manifestPath: entry.path,
        outputDir: result.value.outputDir,
      };
    }
    // Extract name from manifest for error reporting
    let name = "unknown";
    try {
      if (typeof entry.manifest.input !== "function") {
        name = entry.manifest.input.name;
      }
    } catch {
      /* ignore */
    }

    return {
      status: "rejected" as const,
      name,
      manifestPath: entry.path,
      reason: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
    };
  });
}
