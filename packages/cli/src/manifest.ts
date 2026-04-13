// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * An OpenAPI source definition.
 * - Paths starting with `@` are resolved as node_modules (e.g. `@fastly/security-api-oas/dist/openapi.yaml`)
 * - All other paths are resolved relative to the project root
 */
export interface Source {
  /** Path to OpenAPI spec */
  path: string;
  /** Shell command to preprocess the spec before parsing */
  preprocessor?: string;
  /** Filter function — return true to include an operation */
  filter?: (operationId: string) => boolean;
}

/** Build options for code generation. */
export interface BuildOptions {
  /** Use .strict() on all generated object schemas. @default true */
  strictObjects?: boolean;
  /** Allow additional properties on objects by default. @default false */
  additionalPropsDefault?: boolean;
  /** Expression to match JSON media types. @default 'mediaType.includes("json")' */
  mediaTypeExpr?: string;
  /** Zod version to target. @default 4 */
  zodVersion?: 3 | 4;
  /** Output directory name, relative to manifest location. @default "_client" */
  outputDir?: string;
  /** Output filename. @default "schemas.ts" */
  outputFile?: string;
}

/** Input shape for defineManifest — either a plain object or function form. */
export interface ManifestInput {
  /** Display name for this client (used in CLI output and --filter) */
  name: string;
  /** One or more OpenAPI sources to generate from */
  sources: Source[];
  /** Build options — overrides config-level defaults */
  options?: BuildOptions;
}

/** Context passed to the function form of defineManifest. */
export interface ManifestContext {
  /** Sources defined in oax.config.ts, keyed by name */
  sources: Record<string, Source>;
}

/** Opaque manifest object returned by defineManifest. */
export interface Manifest {
  __type: "oax-manifest";
  input: ManifestInput | ((ctx: ManifestContext) => ManifestInput);
}

// ─── Config types ───────────────────────────────────────────────────────────

/** Input shape for defineConfig. */
export interface ConfigInput {
  /** Named map of available OpenAPI sources */
  sources: Record<string, Source>;
  /** Default build options applied to all manifests */
  options?: BuildOptions;
}

/** Resolved config object. */
export interface Config {
  sources: Record<string, Source>;
  options: BuildOptions;
}

// ─── Default options ────────────────────────────────────────────────────────

export const DEFAULT_BUILD_OPTIONS: Required<
  Pick<BuildOptions, "strictObjects" | "additionalPropsDefault" | "mediaTypeExpr" | "zodVersion" | "outputDir" | "outputFile">
> = {
  strictObjects: true,
  additionalPropsDefault: false,
  mediaTypeExpr: 'mediaType.includes("json")',
  zodVersion: 4,
  outputDir: "_client",
  outputFile: "schemas.ts",
};

// ─── defineConfig ───────────────────────────────────────────────────────────

/**
 * Creates a project-level oax configuration.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@oax/cli";
 *
 * export default defineConfig({
 *   sources: {
 *     petstore: { path: "specs/petstore.yaml" },
 *   },
 *   options: { strictObjects: true },
 * });
 * ```
 */
export function defineConfig(input: ConfigInput): Config {
  return {
    sources: input.sources,
    options: { ...DEFAULT_BUILD_OPTIONS, ...input.options },
  };
}

// ─── defineManifest ─────────────────────────────────────────────────────────

/**
 * Defines a manifest for client generation.
 *
 * Accepts a plain object (standalone) or a function that receives
 * config context (sources from oax.config.ts).
 *
 * @example
 * ```ts
 * // Function form — receives sources from config
 * export default defineManifest(({ sources }) => ({
 *   name: "petstore",
 *   sources: [sources.petstore],
 * }));
 *
 * // Object form — standalone, no config needed
 * export default defineManifest({
 *   name: "my-api",
 *   sources: [{ path: "./openapi.yaml" }],
 * });
 * ```
 */
export function defineManifest(
  input: ManifestInput | ((ctx: ManifestContext) => ManifestInput),
): Manifest {
  return { __type: "oax-manifest", input };
}

// ─── resolveManifest ────────────────────────────────────────────────────────

/**
 * Resolves a manifest by calling its function with sources, or returning
 * the plain object as-is.
 */
export function resolveManifest(
  manifest: Manifest,
  configSources: Record<string, Source>,
): ManifestInput {
  if (typeof manifest.input === "function") {
    return manifest.input({ sources: configSources });
  }
  return manifest.input;
}
