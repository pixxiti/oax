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

    expect(spec.paths["/pets"]?.get?.operationId).toBe("listPets");
    expect(spec.paths["/pets"]?.post).toBeUndefined();
    expect(spec.paths["/pets/{petId}"]).toBeUndefined();

    fs.unlinkSync(filtered);
  });

  it("preserves transitive $ref dependencies for kept operations", () => {
    const specPath = path.join(fixturesDir, "petstore.json");
    const filtered = filterSpec(specPath, (op) => op === "listPets", tmpDir);
    const spec = JSON.parse(fs.readFileSync(filtered, "utf-8"));

    expect(spec.components?.schemas?.Pet).toBeDefined();
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

    expect(spec.paths["/pets"]?.get?.operationId).toBe("listPets");
    expect(spec.paths["/users"]?.get?.operationId).toBe("listUsers");
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

    expect(spec.paths["/pets"]?.get?.operationId).toBe("listPets");
    expect(spec.paths["/pets"]?.post).toBeUndefined();
    expect(spec.paths["/users"]?.get?.operationId).toBe("listUsers");

    fs.unlinkSync(mergedPath);
  });
});
