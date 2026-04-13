# Manifest-Driven Client Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `oax.config.ts` / `oax.manifest.ts` system so users can declare OpenAPI sources and generate typed Zod clients by running `oax generate` — no custom scripts needed.

**Architecture:** Three new modules (`manifest.ts`, `discovery.ts`, `spec-resolver.ts`) handle defining manifests, discovering config/manifest files, and resolving/filtering/merging OpenAPI specs. A new `generate` CLI command orchestrates the flow. The existing pipeline system (`oax build`) is untouched. `js-yaml` is added as a dependency for YAML spec parsing.

**Tech Stack:** TypeScript, vitest, Commander.js, js-yaml, @apidevtools/swagger-parser, prettier

**Spec:** `docs/superpowers/specs/2026-04-13-manifest-driven-generation-design.md`

---

### Task 1: Add js-yaml dependency

**Files:**
- Modify: `packages/cli/package.json:29-36` (dependencies)

- [ ] **Step 1: Install js-yaml and its types**

```bash
cd packages/cli && pnpm add js-yaml && pnpm add -D @types/js-yaml
```

- [ ] **Step 2: Verify install**

Run: `cd packages/cli && pnpm ls js-yaml`
Expected: `js-yaml` listed in dependencies

- [ ] **Step 3: Commit**

```bash
git add packages/cli/package.json pnpm-lock.yaml
git commit -m "chore(cli): add js-yaml dependency for YAML spec parsing"
```

---

### Task 2: Types and `defineManifest`

**Files:**
- Create: `packages/cli/src/manifest.ts`
- Test: `packages/cli/tests/manifest.test.ts`

- [ ] **Step 1: Write failing tests for defineManifest**

Create `packages/cli/tests/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineManifest, resolveManifest, type Source } from "../src/manifest";

describe("defineManifest", () => {
  it("returns a manifest from a plain object", () => {
    const manifest = defineManifest({
      name: "my-api",
      sources: [{ path: "specs/openapi.yaml" }],
    });

    expect(manifest).toEqual({
      __type: "oax-manifest",
      input: {
        name: "my-api",
        sources: [{ path: "specs/openapi.yaml" }],
      },
    });
  });

  it("returns a manifest from a function", () => {
    const manifest = defineManifest(({ sources }) => ({
      name: "my-api",
      sources: [sources.main],
    }));

    expect(manifest).toEqual({
      __type: "oax-manifest",
      input: expect.any(Function),
    });
  });
});

describe("resolveManifest", () => {
  const configSources: Record<string, Source> = {
    petstore: { path: "specs/petstore.yaml" },
    users: { path: "specs/users.yaml" },
  };

  it("resolves a plain-object manifest", () => {
    const manifest = defineManifest({
      name: "petstore",
      sources: [{ path: "specs/petstore.yaml" }],
    });

    const resolved = resolveManifest(manifest, configSources);

    expect(resolved).toEqual({
      name: "petstore",
      sources: [{ path: "specs/petstore.yaml" }],
    });
  });

  it("resolves a function manifest with config sources", () => {
    const manifest = defineManifest(({ sources }) => ({
      name: "petstore",
      sources: [sources.petstore],
    }));

    const resolved = resolveManifest(manifest, configSources);

    expect(resolved).toEqual({
      name: "petstore",
      sources: [{ path: "specs/petstore.yaml" }],
    });
  });

  it("resolves a function manifest that spreads and overrides sources", () => {
    const manifest = defineManifest(({ sources }) => ({
      name: "petstore-filtered",
      sources: [{ ...sources.petstore, filter: (o: string) => o === "listPets" }],
      options: { strictObjects: false },
    }));

    const resolved = resolveManifest(manifest, configSources);

    expect(resolved.name).toBe("petstore-filtered");
    expect(resolved.sources[0].path).toBe("specs/petstore.yaml");
    expect(resolved.sources[0].filter).toBeInstanceOf(Function);
    expect(resolved.sources[0].filter!("listPets")).toBe(true);
    expect(resolved.sources[0].filter!("createPet")).toBe(false);
    expect(resolved.options).toEqual({ strictObjects: false });
  });

  it("resolves a function manifest with empty sources when no config", () => {
    const manifest = defineManifest(({ sources }) => ({
      name: "standalone",
      sources: [sources.nonexistent],
    }));

    const resolved = resolveManifest(manifest, {});

    expect(resolved.sources[0]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run tests/manifest.test.ts`
Expected: FAIL — module `../src/manifest` does not exist

- [ ] **Step 3: Implement manifest.ts**

Create `packages/cli/src/manifest.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run tests/manifest.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/manifest.ts packages/cli/tests/manifest.test.ts
git commit -m "feat(cli): add defineManifest, defineConfig, and manifest types"
```

---

### Task 3: Config and manifest discovery

**Files:**
- Create: `packages/cli/src/discovery.ts`
- Test: `packages/cli/tests/discovery.test.ts`

- [ ] **Step 1: Write failing tests for discovery**

Create `packages/cli/tests/discovery.test.ts`:

```ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverManifests, loadConfig } from "../src/discovery";

describe("discoverManifests", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oax-discover-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("discovers oax.manifest.ts files recursively", () => {
    // Create nested manifest files
    const dir1 = path.join(tmpDir, "src", "resources", "pets");
    const dir2 = path.join(tmpDir, "src", "resources", "users");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir1, "oax.manifest.ts"), "export default {}");
    fs.writeFileSync(path.join(dir2, "oax.manifest.ts"), "export default {}");

    const results = discoverManifests(tmpDir);

    expect(results).toHaveLength(2);
    expect(results).toContain(path.join(dir1, "oax.manifest.ts"));
    expect(results).toContain(path.join(dir2, "oax.manifest.ts"));
  });

  it("skips node_modules and dist directories", () => {
    const nodeModDir = path.join(tmpDir, "node_modules", "pkg");
    const distDir = path.join(tmpDir, "dist", "out");
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(nodeModDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(nodeModDir, "oax.manifest.ts"), "export default {}");
    fs.writeFileSync(path.join(distDir, "oax.manifest.ts"), "export default {}");
    fs.writeFileSync(path.join(srcDir, "oax.manifest.ts"), "export default {}");

    const results = discoverManifests(tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0]).toContain("src");
  });

  it("returns empty array when no manifests found", () => {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "export default {}");

    const results = discoverManifests(tmpDir);

    expect(results).toEqual([]);
  });

  it("returns results sorted alphabetically", () => {
    const dirB = path.join(tmpDir, "src", "b");
    const dirA = path.join(tmpDir, "src", "a");
    fs.mkdirSync(dirB, { recursive: true });
    fs.mkdirSync(dirA, { recursive: true });
    fs.writeFileSync(path.join(dirB, "oax.manifest.ts"), "export default {}");
    fs.writeFileSync(path.join(dirA, "oax.manifest.ts"), "export default {}");

    const results = discoverManifests(tmpDir);

    expect(results[0]).toContain("/a/");
    expect(results[1]).toContain("/b/");
  });
});

describe("loadConfig", () => {
  it("returns null when no config file exists", async () => {
    const result = await loadConfig("/nonexistent/path/oax.config.ts");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run tests/discovery.test.ts`
Expected: FAIL — module `../src/discovery` does not exist

- [ ] **Step 3: Implement discovery.ts**

Create `packages/cli/src/discovery.ts`:

```ts
import * as fs from "fs";
import * as path from "path";
import type { Config, Manifest } from "./manifest";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const MANIFEST_FILENAME = "oax.manifest.ts";
const CONFIG_FILENAME = "oax.config.ts";

/**
 * Recursively discovers all `oax.manifest.ts` files under the given root.
 * Skips `node_modules`, `dist`, and `.git` directories.
 * Returns absolute paths sorted alphabetically.
 */
export function discoverManifests(root: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === MANIFEST_FILENAME) {
        results.push(full);
      }
    }
  }

  walk(root);
  return results.sort();
}

/**
 * Loads and returns the oax config from the given path.
 * Returns null if the file does not exist.
 */
export async function loadConfig(configPath: string): Promise<Config | null> {
  try {
    fs.accessSync(configPath);
  } catch {
    return null;
  }

  const mod = await import(configPath);
  return (mod.default ?? mod) as Config;
}

/**
 * Loads a manifest module from the given file path.
 */
export async function loadManifest(filePath: string): Promise<Manifest> {
  const mod = await import(filePath);
  const manifest = mod.default ?? mod;

  if (!manifest || manifest.__type !== "oax-manifest") {
    throw new Error(
      `Invalid manifest at ${filePath}. Did you use defineManifest()?`,
    );
  }

  return manifest as Manifest;
}

/**
 * Returns the default config file path for a given project root.
 */
export function defaultConfigPath(projectRoot: string): string {
  return path.resolve(projectRoot, CONFIG_FILENAME);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run tests/discovery.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/discovery.ts packages/cli/tests/discovery.test.ts
git commit -m "feat(cli): add manifest and config file discovery"
```

---

### Task 4: Spec path resolution, filtering, and merging

**Files:**
- Create: `packages/cli/src/spec-resolver.ts`
- Test: `packages/cli/tests/spec-resolver.test.ts`
- Create: `packages/cli/tests/fixtures/multi-spec-a.json` (test fixture)
- Create: `packages/cli/tests/fixtures/multi-spec-b.json` (test fixture)

- [ ] **Step 1: Create test fixtures for multi-source merging**

Create `packages/cli/tests/fixtures/multi-spec-a.json`:

```json
{
  "openapi": "3.0.3",
  "info": { "title": "Spec A", "version": "1.0.0" },
  "paths": {
    "/pets": {
      "get": {
        "operationId": "listPets",
        "summary": "List pets",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Pet" }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Pet": {
        "type": "object",
        "required": ["id", "name"],
        "properties": {
          "id": { "type": "integer" },
          "name": { "type": "string" }
        }
      }
    }
  }
}
```

Create `packages/cli/tests/fixtures/multi-spec-b.json`:

```json
{
  "openapi": "3.0.3",
  "info": { "title": "Spec B", "version": "1.0.0" },
  "paths": {
    "/users": {
      "get": {
        "operationId": "listUsers",
        "summary": "List users",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/User" }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "required": ["id", "email"],
        "properties": {
          "id": { "type": "integer" },
          "email": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write failing tests for spec-resolver**

Create `packages/cli/tests/spec-resolver.test.ts`:

```ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveSpecPath,
  filterSpec,
  mergeSpecs,
} from "../src/spec-resolver";

describe("resolveSpecPath", () => {
  it("resolves @-prefixed paths via node_modules", () => {
    const result = resolveSpecPath("@fastly/security-api-oas/dist/openapi.yaml", "/project");
    expect(result).toBe("/project/node_modules/@fastly/security-api-oas/dist/openapi.yaml");
  });

  it("resolves relative paths from project root", () => {
    const result = resolveSpecPath("src/specs/openapi.yaml", "/project");
    expect(result).toBe("/project/src/specs/openapi.yaml");
  });

  it("resolves paths starting with ./ from project root", () => {
    const result = resolveSpecPath("./specs/openapi.yaml", "/project");
    expect(result).toBe("/project/specs/openapi.yaml");
  });

  it("preserves absolute paths as-is", () => {
    const result = resolveSpecPath("/absolute/path/openapi.yaml", "/project");
    expect(result).toBe("/absolute/path/openapi.yaml");
  });
});

describe("filterSpec", () => {
  const fixturesDir = path.resolve(__dirname, "fixtures");
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oax-filter-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps matching operations and removes non-matching", () => {
    const specPath = path.join(fixturesDir, "petstore.json");
    const filtered = filterSpec(specPath, (op) => op === "listPets", tmpDir);
    const spec = JSON.parse(fs.readFileSync(filtered, "utf-8"));

    // listPets should be kept
    expect(spec.paths["/pets"]?.get?.operationId).toBe("listPets");
    // createPet should be removed
    expect(spec.paths["/pets"]?.post).toBeUndefined();
    // getPetById should be removed, and its path entry gone entirely
    expect(spec.paths["/pets/{petId}"]).toBeUndefined();

    fs.unlinkSync(filtered);
  });

  it("preserves transitive $ref dependencies for kept operations", () => {
    const specPath = path.join(fixturesDir, "petstore.json");
    const filtered = filterSpec(specPath, (op) => op === "listPets", tmpDir);
    const spec = JSON.parse(fs.readFileSync(filtered, "utf-8"));

    // Pet schema should be preserved (referenced by listPets response)
    expect(spec.components?.schemas?.Pet).toBeDefined();
    // NewPet should be removed (only used by createPet)
    expect(spec.components?.schemas?.NewPet).toBeUndefined();

    fs.unlinkSync(filtered);
  });
});

describe("mergeSpecs", () => {
  const fixturesDir = path.resolve(__dirname, "fixtures");
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oax-merge-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("merges paths and components from multiple specs", () => {
    const sources = [
      { path: path.join(fixturesDir, "multi-spec-a.json") },
      { path: path.join(fixturesDir, "multi-spec-b.json") },
    ];

    const mergedPath = mergeSpecs(sources, tmpDir);
    const spec = JSON.parse(fs.readFileSync(mergedPath, "utf-8"));

    // Paths from both specs
    expect(spec.paths["/pets"]?.get?.operationId).toBe("listPets");
    expect(spec.paths["/users"]?.get?.operationId).toBe("listUsers");

    // Components from both specs
    expect(spec.components?.schemas?.Pet).toBeDefined();
    expect(spec.components?.schemas?.User).toBeDefined();

    fs.unlinkSync(mergedPath);
  });

  it("applies source filters before merging", () => {
    const sources = [
      { path: path.join(fixturesDir, "petstore.json"), filter: (op: string) => op === "listPets" },
      { path: path.join(fixturesDir, "multi-spec-b.json") },
    ];

    const mergedPath = mergeSpecs(sources, tmpDir);
    const spec = JSON.parse(fs.readFileSync(mergedPath, "utf-8"));

    // listPets kept, createPet filtered out
    expect(spec.paths["/pets"]?.get?.operationId).toBe("listPets");
    expect(spec.paths["/pets"]?.post).toBeUndefined();
    // users spec merged in unfiltered
    expect(spec.paths["/users"]?.get?.operationId).toBe("listUsers");

    fs.unlinkSync(mergedPath);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run tests/spec-resolver.test.ts`
Expected: FAIL — module `../src/spec-resolver` does not exist

- [ ] **Step 4: Implement spec-resolver.ts**

Create `packages/cli/src/spec-resolver.ts`:

```ts
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import yaml from "js-yaml";
import type { Source } from "./manifest";

// ─── Types ──────────────────────────────────────────────────────────────────

type OpenAPISpec = {
  openapi?: string;
  info?: Record<string, unknown>;
  servers?: unknown[];
  paths?: Record<string, Record<string, unknown>>;
  components?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

// ─── Path resolution ────────────────────────────────────────────────────────

/**
 * Resolves a source path to an absolute path.
 * - `@`-prefixed paths resolve via node_modules (scoped npm packages)
 * - Absolute paths are returned as-is
 * - All other paths resolve relative to project root
 */
export function resolveSpecPath(specPath: string, projectRoot: string): string {
  if (path.isAbsolute(specPath)) {
    return specPath;
  }
  if (specPath.startsWith("@")) {
    return path.resolve(projectRoot, "node_modules", specPath);
  }
  return path.resolve(projectRoot, specPath);
}

// ─── Spec reading ───────────────────────────────────────────────────────────

function readSpec(filePath: string): OpenAPISpec {
  const content = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") {
    return JSON.parse(content) as OpenAPISpec;
  }
  return yaml.load(content) as OpenAPISpec;
}

function writeSpecToTemp(spec: OpenAPISpec, tmpDir: string): string {
  const tmpFile = path.join(
    tmpDir,
    `oax-spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmpFile, JSON.stringify(spec, null, 2));
  return tmpFile;
}

// ─── $ref collection ────────────────────────────────────────────────────────

function collectRefs(obj: unknown): Set<string> {
  const refs = new Set<string>();
  function walk(node: unknown) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (typeof record.$ref === "string") {
        refs.add(record.$ref);
      }
      for (const val of Object.values(record)) {
        walk(val);
      }
    }
  }
  walk(obj);
  return refs;
}

function resolveTransitiveRefs(
  components: Record<string, Record<string, unknown>> | undefined,
  initialRefs: Set<string>,
): Set<string> {
  const all = new Set(initialRefs);
  const queue = [...initialRefs];
  while (queue.length > 0) {
    const ref = queue.pop()!;
    const match = ref.match(/^#\/components\/(\w+)\/(.+)$/);
    if (!match || !components) continue;
    const [, section, name] = match;
    const component = components[section]?.[name];
    if (!component) continue;
    for (const newRef of collectRefs(component)) {
      if (!all.has(newRef)) {
        all.add(newRef);
        queue.push(newRef);
      }
    }
  }
  return all;
}

// ─── Filtering ──────────────────────────────────────────────────────────────

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

/**
 * Filters an OpenAPI spec to only include operations matching the filter function.
 * Preserves transitive $ref dependencies for kept operations.
 * Returns path to a temp file containing the filtered spec.
 */
export function filterSpec(
  specPath: string,
  filter: (operationId: string) => boolean,
  tmpDir: string,
): string {
  const spec = readSpec(specPath);
  const filteredPaths: Record<string, Record<string, unknown>> = {};

  for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
    const filteredMethods: Record<string, unknown> = {};
    let hasKept = false;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (operation && typeof operation.operationId === "string") {
        if (filter(operation.operationId)) {
          filteredMethods[method] = operation;
          hasKept = true;
        }
      }
    }

    if (hasKept) {
      if (pathItem.parameters) {
        filteredMethods.parameters = pathItem.parameters;
      }
      filteredPaths[pathKey] = filteredMethods;
    }
  }

  const directRefs = collectRefs(Object.values(filteredPaths));
  const allRefs = resolveTransitiveRefs(spec.components, directRefs);

  const filteredComponents: Record<string, Record<string, unknown>> = {};
  if (spec.components) {
    for (const [section, entries] of Object.entries(spec.components)) {
      const kept: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(entries as Record<string, unknown>)) {
        if (allRefs.has(`#/components/${section}/${name}`)) {
          kept[name] = value;
        }
      }
      if (Object.keys(kept).length > 0) {
        filteredComponents[section] = kept;
      }
    }
  }

  const filtered: OpenAPISpec = {
    ...spec,
    paths: filteredPaths,
    components: Object.keys(filteredComponents).length > 0 ? filteredComponents : undefined,
  };

  return writeSpecToTemp(filtered, tmpDir);
}

// ─── Merging ────────────────────────────────────────────────────────────────

/**
 * Merges multiple OpenAPI sources into a single spec.
 * Applies per-source filters before merging.
 * Returns path to a temp file containing the merged spec.
 */
export function mergeSpecs(
  sources: Array<Pick<Source, "path" | "filter">>,
  tmpDir: string,
): string {
  const mergedPaths: Record<string, Record<string, unknown>> = {};
  const mergedComponents: Record<string, Record<string, unknown>> = {};
  let baseSpec: OpenAPISpec | null = null;

  for (const source of sources) {
    let effectivePath = source.path;

    if (source.filter) {
      effectivePath = filterSpec(source.path, source.filter, tmpDir);
    }

    const spec = readSpec(effectivePath);

    if (!baseSpec) {
      baseSpec = { ...spec, paths: {}, components: {} };
    }

    for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
      if (mergedPaths[pathKey]) {
        Object.assign(mergedPaths[pathKey], pathItem);
      } else {
        mergedPaths[pathKey] = { ...pathItem };
      }
    }

    if (spec.components) {
      for (const [section, entries] of Object.entries(spec.components)) {
        if (!mergedComponents[section]) {
          mergedComponents[section] = {};
        }
        for (const [name, value] of Object.entries(entries as Record<string, unknown>)) {
          mergedComponents[section][name] = value;
        }
      }
    }

    // Clean up temp file from filtering
    if (source.filter) {
      fs.unlinkSync(effectivePath);
    }
  }

  const merged: OpenAPISpec = {
    ...baseSpec,
    paths: mergedPaths,
    components: Object.keys(mergedComponents).length > 0 ? mergedComponents : undefined,
  };

  return writeSpecToTemp(merged, tmpDir);
}

// ─── Preprocessing ──────────────────────────────────────────────────────────

/**
 * Runs a preprocessor shell command. The command is executed from the project root.
 */
export function runPreprocessor(command: string, projectRoot: string): void {
  const [cmd, ...args] = command.split(/\s+/);
  execFileSync(cmd, args, { cwd: projectRoot, stdio: "pipe" });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run tests/spec-resolver.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/spec-resolver.ts packages/cli/tests/spec-resolver.test.ts packages/cli/tests/fixtures/multi-spec-a.json packages/cli/tests/fixtures/multi-spec-b.json
git commit -m "feat(cli): add spec path resolution, filtering, and merging"
```

---

### Task 5: Generation orchestrator

**Files:**
- Create: `packages/cli/src/generate.ts`
- Test: `packages/cli/tests/generate.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `packages/cli/tests/generate.test.ts`:

```ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineConfig, defineManifest } from "../src/manifest";
import { generate, type GenerateOptions } from "../src/generate";

const fixturesDir = path.resolve(__dirname, "fixtures");
const petstorePath = path.join(fixturesDir, "petstore.json");

describe("generate", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oax-generate-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates schemas.ts from a manifest with inline source", async () => {
    // Create manifest dir structure
    const manifestDir = path.join(tmpDir, "src", "resources", "pets");
    fs.mkdirSync(manifestDir, { recursive: true });

    const manifest = defineManifest({
      name: "petstore",
      sources: [{ path: petstorePath }],
    });

    const results = await generate({
      projectRoot: tmpDir,
      manifests: [{ path: path.join(manifestDir, "oax.manifest.ts"), manifest }],
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("fulfilled");

    const outputPath = path.join(manifestDir, "_client", "schemas.ts");
    expect(fs.existsSync(outputPath)).toBe(true);

    const content = fs.readFileSync(outputPath, "utf-8");
    expect(content).toContain("import { z }");
    expect(content).toContain("listPets");
  });

  it("generates using config sources via function-form manifest", async () => {
    const manifestDir = path.join(tmpDir, "src", "resources", "pets");
    fs.mkdirSync(manifestDir, { recursive: true });

    const config = defineConfig({
      sources: {
        petstore: { path: petstorePath },
      },
    });

    const manifest = defineManifest(({ sources }) => ({
      name: "petstore",
      sources: [sources.petstore],
    }));

    const results = await generate({
      projectRoot: tmpDir,
      config,
      manifests: [{ path: path.join(manifestDir, "oax.manifest.ts"), manifest }],
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("fulfilled");

    const outputPath = path.join(manifestDir, "_client", "schemas.ts");
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it("respects custom outputDir and outputFile", async () => {
    const manifestDir = path.join(tmpDir, "src", "resources", "pets");
    fs.mkdirSync(manifestDir, { recursive: true });

    const manifest = defineManifest({
      name: "petstore",
      sources: [{ path: petstorePath }],
      options: { outputDir: "generated", outputFile: "api.ts" },
    });

    await generate({
      projectRoot: tmpDir,
      manifests: [{ path: path.join(manifestDir, "oax.manifest.ts"), manifest }],
    });

    const outputPath = path.join(manifestDir, "generated", "api.ts");
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it("filters manifests when filter option is provided", async () => {
    const dir1 = path.join(tmpDir, "src", "a");
    const dir2 = path.join(tmpDir, "src", "b");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    const manifest1 = defineManifest({ name: "pets", sources: [{ path: petstorePath }] });
    const manifest2 = defineManifest({ name: "users", sources: [{ path: petstorePath }] });

    const results = await generate({
      projectRoot: tmpDir,
      manifests: [
        { path: path.join(dir1, "oax.manifest.ts"), manifest: manifest1 },
        { path: path.join(dir2, "oax.manifest.ts"), manifest: manifest2 },
      ],
      filter: "pets",
    });

    // Only pets manifest should generate
    expect(results).toHaveLength(1);
    expect(fs.existsSync(path.join(dir1, "_client", "schemas.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir2, "_client", "schemas.ts"))).toBe(false);
  });

  it("merges config options with manifest options (manifest wins)", async () => {
    const manifestDir = path.join(tmpDir, "src", "resources", "pets");
    fs.mkdirSync(manifestDir, { recursive: true });

    const config = defineConfig({
      sources: { petstore: { path: petstorePath } },
      options: { strictObjects: true, outputFile: "client.ts" },
    });

    const manifest = defineManifest(({ sources }) => ({
      name: "petstore",
      sources: [sources.petstore],
      options: { outputFile: "api.ts" },
    }));

    await generate({
      projectRoot: tmpDir,
      config,
      manifests: [{ path: path.join(manifestDir, "oax.manifest.ts"), manifest }],
    });

    // Manifest's outputFile should win over config
    expect(fs.existsSync(path.join(manifestDir, "_client", "api.ts"))).toBe(true);
    expect(fs.existsSync(path.join(manifestDir, "_client", "client.ts"))).toBe(false);
  });

  it("reports errors per-manifest without blocking others", async () => {
    const dir1 = path.join(tmpDir, "src", "a");
    const dir2 = path.join(tmpDir, "src", "b");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    const goodManifest = defineManifest({ name: "good", sources: [{ path: petstorePath }] });
    const badManifest = defineManifest({ name: "bad", sources: [{ path: "/nonexistent/spec.json" }] });

    const results = await generate({
      projectRoot: tmpDir,
      manifests: [
        { path: path.join(dir1, "oax.manifest.ts"), manifest: goodManifest },
        { path: path.join(dir2, "oax.manifest.ts"), manifest: badManifest },
      ],
    });

    expect(results).toHaveLength(2);
    // Good manifest succeeds
    expect(results.find((r) => r.status === "fulfilled")).toBeDefined();
    // Bad manifest fails
    expect(results.find((r) => r.status === "rejected")).toBeDefined();
    // Good manifest output still exists
    expect(fs.existsSync(path.join(dir1, "_client", "schemas.ts"))).toBe(true);
  });

  it("errors when function-form manifest used without config", async () => {
    const manifestDir = path.join(tmpDir, "src", "resources", "pets");
    fs.mkdirSync(manifestDir, { recursive: true });

    const manifest = defineManifest(({ sources }) => ({
      name: "petstore",
      sources: [sources.petstore],
    }));

    const results = await generate({
      projectRoot: tmpDir,
      manifests: [{ path: path.join(manifestDir, "oax.manifest.ts"), manifest }],
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("rejected");
    expect((results[0] as PromiseRejectedResult).reason.message).toContain(
      "no oax.config.ts was found",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run tests/generate.test.ts`
Expected: FAIL — module `../src/generate` does not exist

- [ ] **Step 3: Implement generate.ts**

Create `packages/cli/src/generate.ts`:

```ts
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

function mergeOptions(configOptions: BuildOptions, manifestOptions?: BuildOptions): Required<BuildOptions> {
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
  projectRoot: string,
): Promise<{ name: string; outputDir: string }> {
  // Resolve manifest (call function or use object)
  let resolved: ManifestInput;
  if (typeof entry.manifest.input === "function") {
    if (!config) {
      throw new Error(
        `Manifest at ${entry.path} uses function form but no oax.config.ts was found. ` +
          `Use the object form of defineManifest or create an oax.config.ts with your sources.`,
      );
    }
    resolved = resolveManifest(entry.manifest, config.sources);
  } else {
    resolved = resolveManifest(entry.manifest, config?.sources ?? {});
  }

  // Merge options: defaults ← config ← manifest
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
    manifests.map((entry) => processManifest(entry, config, projectRoot)),
  );

  return settled.map((result, i) => {
    const entry = manifests[i];
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
    } catch { /* ignore */ }

    return {
      status: "rejected" as const,
      name,
      manifestPath: entry.path,
      reason: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run tests/generate.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/generate.ts packages/cli/tests/generate.test.ts
git commit -m "feat(cli): add generate orchestrator for manifest-driven client generation"
```

---

### Task 6: CLI command — rename `generate` to `generate-file`, add new `generate`

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/config.ts` (rename `defineConfig` to `definePipelineConfig`)
- Modify: `oax.config.ts` (update import)
- Modify: `examples/pipeline/oax.config.ts` (update import)

- [ ] **Step 1: Rename existing `defineConfig` to `definePipelineConfig` in config.ts**

In `packages/cli/src/config.ts`, rename the function and update the example:

Replace the existing `defineConfig` function:

```ts
/**
 * Creates a pipeline configuration
 */
export function defineConfig(config: ConfigDefinition): PipelineConfig {
```

With:

```ts
/**
 * Creates a pipeline configuration for `oax build`.
 */
export function definePipelineConfig(config: ConfigDefinition): PipelineConfig {
```

Also update `exampleConfig` usage comment if it references `defineConfig`.

- [ ] **Step 2: Update oax.config.ts at project root**

Replace:

```ts
import { defineConfig } from "./packages/cli/src/config";
```

With:

```ts
import { definePipelineConfig } from "./packages/cli/src/config";
```

And `defineConfig(` → `definePipelineConfig(`.

- [ ] **Step 3: Update examples/pipeline/oax.config.ts**

Replace:

```ts
import { defineConfig } from "../../packages/cli/src/config";
```

With:

```ts
import { definePipelineConfig } from "../../packages/cli/src/config";
```

And `defineConfig(` → `definePipelineConfig(`.

- [ ] **Step 4: Update CLI in index.ts**

Replace the full contents of `packages/cli/src/index.ts` with:

```ts
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
      config: config ?? undefined,
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
```

- [ ] **Step 5: Update pipeline.ts to use renamed function**

In `packages/cli/src/pipeline.ts:164`, the `loadPipelineConfig` function is already independent — it imports the pipeline config directly. No change needed here.

- [ ] **Step 6: Run existing tests to check for regressions**

Run: `cd packages/cli && npx vitest run`
Expected: All tests PASS (existing generator tests + new manifest/discovery/spec-resolver/generate tests)

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/config.ts oax.config.ts examples/pipeline/oax.config.ts
git commit -m "feat(cli): add oax generate command, rename old generate to generate-file"
```

---

### Task 7: Public exports

**Files:**
- Create: `packages/cli/src/exports.ts`
- Modify: `packages/cli/package.json:7-11` (exports field)

- [ ] **Step 1: Create exports.ts**

Create `packages/cli/src/exports.ts`:

```ts
/**
 * Public API for @oax/cli.
 *
 * Usage:
 *   import { defineConfig, defineManifest } from "@oax/cli";
 */
export {
  defineConfig,
  defineManifest,
  resolveManifest,
  DEFAULT_BUILD_OPTIONS,
} from "./manifest";

export type {
  Source,
  BuildOptions,
  ManifestInput,
  ManifestContext,
  Manifest,
  ConfigInput,
  Config,
} from "./manifest";
```

- [ ] **Step 2: Update package.json exports so `import { defineManifest } from "@oax/cli"` works**

In `packages/cli/package.json`, update the `"."` export and `"main"` to point to `exports.js` instead of the CLI binary. The CLI binary is already handled by the `"bin"` field.

Change:

```json
"main": "./dist/index.js",
"exports": {
    ".": "./dist/index.js",
    "./lib": "./dist/lib.js",
    "./exports": "./dist/exports.js"
},
```

To:

```json
"main": "./dist/exports.js",
"exports": {
    ".": "./dist/exports.js",
    "./lib": "./dist/lib.js",
    "./cli": "./dist/index.js"
},
```

The `"bin"` field (`"oax": "./dist/index.js"`) stays unchanged — npm uses `bin` for CLI commands, `exports["."]` for programmatic imports.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/exports.ts packages/cli/package.json
git commit -m "feat(cli): add public exports for defineConfig, defineManifest, and types"
```

---

### Task 8: README documentation

**Files:**
- Create: `packages/cli/README.md`

- [ ] **Step 1: Write README**

Create `packages/cli/README.md`:

````md
# @oax/cli

Generate typed Zod clients from OpenAPI specifications.

## Install

```bash
npm install @oax/cli
```

## Quick Start

### 1. Create `oax.config.ts` at your project root

```ts
import { defineConfig } from "@oax/cli";

export default defineConfig({
  sources: {
    petstore: { path: "specs/petstore.yaml" },
  },
  options: {
    strictObjects: true,
  },
});
```

### 2. Create `oax.manifest.ts` next to your resource

```ts
import { defineManifest } from "@oax/cli";

export default defineManifest(({ sources }) => ({
  name: "petstore",
  sources: [sources.petstore],
}));
```

### 3. Generate

```bash
npx oax generate
```

Output:

```
Generating clients from 1 manifests...

  [1/1] petstore                 -> src/resources/pets/_client/

Done. 1 clients generated.
```

## Config Reference

`oax.config.ts` lives at project root. It defines available sources and default build options.

```ts
import { defineConfig } from "@oax/cli";

export default defineConfig({
  sources: { /* ... */ },
  options: { /* ... */ },
});
```

### Sources

A named map of OpenAPI spec locations:

```ts
sources: {
  petstore: { path: "specs/petstore.yaml" },
  users: {
    path: "@my-org/api-specs/dist/users/openapi.yaml",
    preprocessor: "node scripts/flatten-spec.cjs",
  },
}
```

### Source Path Resolution

- **`@`-prefixed** — resolved via `node_modules/`. Example: `@fastly/security-api-oas/dist/openapi.yaml` resolves to `node_modules/@fastly/security-api-oas/dist/openapi.yaml`.
- **Everything else** — resolved relative to project root. Example: `specs/petstore.yaml` resolves to `<project>/specs/petstore.yaml`.

### Build Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strictObjects` | `boolean` | `true` | Use `.strict()` on all generated object schemas |
| `additionalPropsDefault` | `boolean` | `false` | Allow additional properties on objects |
| `mediaTypeExpr` | `string` | `'mediaType.includes("json")'` | Expression to match JSON media types |
| `zodVersion` | `3 \| 4` | `4` | Zod version to target |
| `outputDir` | `string` | `"_client"` | Output directory, relative to manifest |
| `outputFile` | `string` | `"schemas.ts"` | Output filename |

Options set in config apply to all manifests. Manifests can override any option.

## Manifests

`oax.manifest.ts` files are co-located with the resource that consumes the generated client. Each manifest produces one client.

### Function Form

Receives sources from your config — the recommended approach when using `oax.config.ts`:

```ts
import { defineManifest } from "@oax/cli";

export default defineManifest(({ sources }) => ({
  name: "petstore",
  sources: [sources.petstore],
}));
```

### Object Form

Standalone — no config needed:

```ts
import { defineManifest } from "@oax/cli";

export default defineManifest({
  name: "my-api",
  sources: [{ path: "./openapi.yaml" }],
});
```

### Filtering Operations

Include or exclude specific operations from a source:

```ts
export default defineManifest(({ sources }) => ({
  name: "security-api",
  sources: [
    {
      ...sources.ngwaf,
      filter: (operationId) => operationId !== "getInternalFeatures",
    },
  ],
}));
```

The `filter` function receives an `operationId` and returns `true` to include the operation. Transitive `$ref` dependencies are automatically preserved for included operations.

### Multiple Sources

Merge multiple OpenAPI specs into one client:

```ts
export default defineManifest(({ sources }) => ({
  name: "combined-api",
  sources: [sources.petstore, sources.users],
}));
```

### Preprocessors

Run a shell command before parsing a source spec:

```ts
sources: {
  ddos: {
    path: "specs/ddos.yaml",
    preprocessor: "node scripts/flatten-spec.cjs",
  },
}
```

The command runs from the project root.

### Custom Output

Override the output directory or filename per-manifest:

```ts
export default defineManifest({
  name: "my-api",
  sources: [{ path: "./openapi.yaml" }],
  options: {
    outputDir: "generated",
    outputFile: "api.ts",
  },
});
```

## CLI

### `oax generate`

Discover `oax.manifest.ts` files and generate clients.

```bash
oax generate                        # generate all
oax generate -c custom.config.ts    # custom config path
oax generate --filter petstore      # only generate matching name
```

### `oax generate-file`

Generate a single client file from an OpenAPI spec (no config/manifest needed):

```bash
oax generate-file -i specs/petstore.yaml -o src/client.ts
```

### `oax build`

Run the step-based pipeline defined in `oax.config.ts`:

```bash
oax build
oax build -c custom.config.ts
```
````

- [ ] **Step 2: Commit**

```bash
git add packages/cli/README.md
git commit -m "docs(cli): add README with API documentation and usage guide"
```

---

### Task 9: Run full test suite and typecheck

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd packages/cli && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `cd /Users/bkirkland/oax && pnpm lint`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 4: Fix any issues found in steps 1-3**

If any test failures, type errors, or lint issues are found, fix them and commit:

```bash
git add -A
git commit -m "fix(cli): resolve issues from full test suite verification"
```
