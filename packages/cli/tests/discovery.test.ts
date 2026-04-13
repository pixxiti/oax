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
