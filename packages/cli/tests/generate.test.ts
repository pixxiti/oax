import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generate } from "../src/generate";
import { defineConfig, defineManifest } from "../src/manifest";

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

    expect(fs.existsSync(path.join(manifestDir, "_client", "api.ts"))).toBe(true);
    expect(fs.existsSync(path.join(manifestDir, "_client", "client.ts"))).toBe(false);
  });

  it("reports errors per-manifest without blocking others", async () => {
    const dir1 = path.join(tmpDir, "src", "a");
    const dir2 = path.join(tmpDir, "src", "b");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    const goodManifest = defineManifest({ name: "good", sources: [{ path: petstorePath }] });
    const badManifest = defineManifest({
      name: "bad",
      sources: [{ path: "/nonexistent/spec.json" }],
    });

    const results = await generate({
      projectRoot: tmpDir,
      manifests: [
        { path: path.join(dir1, "oax.manifest.ts"), manifest: goodManifest },
        { path: path.join(dir2, "oax.manifest.ts"), manifest: badManifest },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.status === "fulfilled")).toBeDefined();
    expect(results.find((r) => r.status === "rejected")).toBeDefined();
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
      "no oax.config.ts was found"
    );
  });
});
