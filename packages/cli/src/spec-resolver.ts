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
    const section = match[1];
    const name = match[2];
    if (!section || !name) continue;
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
  };
  if (Object.keys(filteredComponents).length > 0) {
    filtered.components = filteredComponents;
  } else {
    delete filtered.components;
  }

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
  };
  if (Object.keys(mergedComponents).length > 0) {
    merged.components = mergedComponents;
  } else {
    delete merged.components;
  }

  return writeSpecToTemp(merged, tmpDir);
}

// ─── Preprocessing ──────────────────────────────────────────────────────────

/**
 * Runs a preprocessor shell command. The command is executed from the project root.
 */
export function runPreprocessor(command: string, projectRoot: string): void {
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  if (!cmd) {
    throw new Error("Preprocessor command cannot be empty");
  }
  const args = parts.slice(1);
  execFileSync(cmd, args, { cwd: projectRoot, stdio: "pipe" });
}
