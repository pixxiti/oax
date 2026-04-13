# Manifest-Driven Client Generation

## Overview

Add a manifest/config system to oax that lets users declare OpenAPI sources in a project-level config and generate typed Zod clients via co-located manifest files — no custom scripts needed.

This lives alongside the existing pipeline (`oax build`). The pipeline stays for advanced, step-based workflows. The manifest system is the opinionated, plug-and-play path.

## Motivation

Today, using oax in a project requires writing a custom generation script (like security-ui's `generate-zod-clients.ts`) that discovers specs, resolves paths, filters operations, merges multi-source specs, and orchestrates code generation. That script is ~400 lines of boilerplate that every oax consumer would need to replicate.

The manifest system moves all of that into oax itself. A user drops in two files — `oax.config.ts` and one or more `oax.manifest.ts` — and runs `oax generate`.

## User-Facing API

### Config — `oax.config.ts`

Lives at project root. Defines available OpenAPI sources and default build options.

```ts
// oax.config.ts
import { defineConfig } from "@oax/cli";

export default defineConfig({
  sources: {
    ngwaf: { path: "@fastly/security-api-oas/dist/ngwaf/openapi.yaml" },
    ddos: {
      path: "src/lib/oas-specs/ddos-clean.yaml",
      preprocessor: "node scripts/flatten-ddos-spec.cjs",
    },
    productApis: { path: "src/lib/oas-specs/product-apis.yml" },
  },
  options: {
    strictObjects: true,
    additionalPropsDefault: false,
  },
});
```

The config is **optional**. Projects that don't need shared sources or project-wide defaults can skip it entirely.

### Manifest — `oax.manifest.ts`

Co-located with the resource that consumes the generated client. One manifest per client.

**Function form** — receives sources from config:

```ts
// src/resources/ddos/oax.manifest.ts
import { defineManifest } from "@oax/cli";

export default defineManifest(({ sources }) => ({
  name: "ddos",
  sources: [sources.ddos],
}));
```

**Function form with overrides and filtering:**

```ts
// src/resources/ngwaf/oax.manifest.ts
import { defineManifest } from "@oax/cli";

export default defineManifest(({ sources }) => ({
  name: "security-api",
  sources: [
    { ...sources.ngwaf, filter: (o) => o !== "getFeaturesInternal" },
  ],
  options: {
    strictObjects: false,
    additionalPropsDefault: true,
  },
}));
```

**Object form** — standalone, no config needed:

```ts
// oax.manifest.ts
import { defineManifest } from "@oax/cli";

export default defineManifest({
  name: "my-api",
  sources: [{ path: "./openapi.yaml" }],
});
```

Both `defineConfig` and `defineManifest` are imported from `@oax/cli`. No other imports needed.

### CLI — `oax generate`

```bash
oax generate                        # discover config + all manifests, generate all
oax generate -c custom.config.ts    # custom config path
oax generate --filter ddos          # only generate manifests matching name
```

The existing `oax generate` command (single-file generation) is renamed to `oax generate-file`.

### Output

Given a manifest at `src/resources/ddos/oax.manifest.ts`, the default output is:

```
src/resources/ddos/
├── oax.manifest.ts
└── _client/
    └── schemas.ts
```

Both the output directory (`_client`) and filename (`schemas.ts`) are configurable per-manifest via `options.outputDir` and `options.outputFile`.

## Types

```ts
// ─── Source ─────────────────────────────────────────────────────────────────

interface Source {
  /** Path to OpenAPI spec — relative path, absolute path, or bare specifier (npm package) */
  path: string;
  /** Shell command to preprocess the spec before parsing */
  preprocessor?: string;
  /** Filter function — return true to include an operation */
  filter?: (operationId: string) => boolean;
}

// ─── Build Options ──────────────────────────────────────────────────────────

interface BuildOptions {
  /** Use .strict() on all generated object schemas. Default: true */
  strictObjects?: boolean;
  /** Allow additional properties on objects by default. Default: false */
  additionalPropsDefault?: boolean;
  /** Expression to match JSON media types. Default: 'mediaType.includes("json")' */
  mediaTypeExpr?: string;
  /** Zod version to target. Default: 4 */
  zodVersion?: 3 | 4;
  /** Output directory name, relative to manifest location. Default: "_client" */
  outputDir?: string;
  /** Output filename. Default: "schemas.ts" */
  outputFile?: string;
}

// ─── Config ─────────────────────────────────────────────────────────────────

interface ConfigInput {
  /** Named map of available OpenAPI sources */
  sources: Record<string, Source>;
  /** Default build options applied to all manifests */
  options?: BuildOptions;
}

/** Creates the project config. */
function defineConfig(input: ConfigInput): Config;

// ─── Manifest ───────────────────────────────────────────────────────────────

interface ManifestInput {
  /** Display name for this client (used in CLI output and --filter) */
  name: string;
  /** One or more OpenAPI sources to generate from */
  sources: Source[];
  /** Build options — overrides config-level defaults */
  options?: BuildOptions;
}

interface ManifestContext {
  /** Sources defined in oax.config.ts, keyed by name */
  sources: Record<string, Source>;
}

/**
 * Defines a manifest.
 * Accepts a plain object (standalone) or a function that receives
 * config context (sources from oax.config.ts).
 */
function defineManifest(
  input: ManifestInput | ((ctx: ManifestContext) => ManifestInput)
): Manifest;
```

## Generation Flow

```
oax generate
│
├─ 1. Load oax.config.ts (if present)
│     → Extract sources map and default options
│
├─ 2. Discover all oax.manifest.ts files
│     → Walk project root, skip node_modules/dist
│
├─ 3. For each manifest:
│     │
│     ├─ a. Resolve manifest
│     │     → If function: call with { sources } from config
│     │     → If object: use as-is
│     │
│     ├─ b. Merge options
│     │     → Config defaults ← manifest overrides
│     │
│     ├─ c. Preprocess (if preprocessor defined)
│     │     → execFileSync the command
│     │
│     ├─ d. Resolve spec paths
│     │     → Bare specifiers: resolve via node_modules
│     │     → Relative paths: resolve from project root
│     │
│     ├─ e. Filter operations (if filter defined)
│     │     → Parse spec YAML, keep matching operations
│     │     → Collect transitive $ref dependencies
│     │     → Write filtered spec to temp file
│     │
│     ├─ f. Merge sources (if multiple)
│     │     → Merge paths and components from all sources
│     │     → Write merged spec to temp file
│     │
│     ├─ g. Generate
│     │     → parseOAS(specPath)
│     │     → generateSchemasFile(oas, options)
│     │
│     ├─ h. Write output
│     │     → _client/schemas.ts (or configured path)
│     │     → Ensure output directory exists
│     │
│     └─ i. Cleanup temp files
│
└─ 4. Report results
      → [1/5] ddos                     -> src/resources/ddos/_client/
      → [2/5] security-api             -> src/resources/ngwaf/_client/
      → ...
      → Done. 5 clients generated.
```

## Error Handling

- **Missing config**: Not an error. Manifests using function form without a config get a clear error: `Manifest at src/resources/ddos/oax.manifest.ts uses function form but no oax.config.ts was found`.
- **Unknown source key**: `Source "ddoss" not found in oax.config.ts. Available: ngwaf, ddos, productApis`.
- **Spec not found**: `OpenAPI spec not found: src/lib/oas-specs/missing.yaml (resolved from source "ddos")`.
- **Preprocessor failure**: `Preprocessor failed for source "ddos": <stderr output>`.
- **Parse/generation failure**: Per-manifest errors are collected and reported at the end (like security-ui), so one failure doesn't block others.
- **No manifests found**: `No oax.manifest.ts files found.`

## CLI Changes

| Before | After |
|--------|-------|
| `oax generate -i <path> -o <path>` | `oax generate-file -i <path> -o <path>` |
| _(new)_ | `oax generate` — manifest-driven generation |
| `oax build` | `oax build` — unchanged |

## Scope

### In scope

- `defineConfig` and `defineManifest` exports from `@oax/cli`
- Config loading (auto-discover `oax.config.ts` at project root)
- Manifest discovery (walk project for `oax.manifest.ts`)
- Spec path resolution (bare specifiers, relative paths)
- Operation filtering with transitive $ref collection
- Multi-source spec merging
- Preprocessor support
- `oax generate` CLI command
- Rename old `oax generate` to `oax generate-file`
- Per-manifest error reporting

### Out of scope

- Typed source autocomplete via path aliases (opt-in for users who want it, not part of oax)
- Watch mode / incremental generation
- Generating anything beyond schemas.ts (client.ts, hooks, querykeys — those stay in the pipeline)
- Changes to `oax build` or the pipeline system

## File Changes

### New files

- `packages/cli/src/manifest.ts` — `defineManifest`, `Manifest`, `ManifestInput`, `ManifestContext` types, manifest resolution logic
- `packages/cli/src/discovery.ts` — manifest file discovery (walk project tree), config loading
- `packages/cli/src/spec-resolver.ts` — spec path resolution, filtering, merging, preprocessor execution, temp file management

### Modified files

- `packages/cli/src/config.ts` — Add `defineConfig` for the new config format (`ConfigInput` with sources + options). Existing `defineConfig` (pipeline-based) renamed to `definePipelineConfig`.
- `packages/cli/src/index.ts` — Add `generate` command, rename old `generate` to `generate-file`
- `packages/cli/src/exports.ts` — Re-export `defineConfig`, `defineManifest`, and related types

### Unchanged

- `packages/cli/src/pipeline.ts` — Pipeline system stays as-is
- `packages/cli/src/lib.ts` — `parseOAS` and `generateSchemasFile` used as-is
- `packages/core/` — No changes
- `packages/hooks/` — No changes
