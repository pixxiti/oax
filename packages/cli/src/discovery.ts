import * as fs from "fs";
import * as path from "path";
import { tsImport } from "tsx/esm/api";
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

  const mod = await tsImport(configPath, import.meta.url);
  return (mod.default ?? mod) as Config;
}

/**
 * Loads a manifest module from the given file path.
 */
export async function loadManifest(filePath: string): Promise<Manifest> {
  const mod = await tsImport(filePath, import.meta.url);
  const manifest = mod.default ?? mod;

  if (!manifest || manifest.__type !== "oax-manifest") {
    throw new Error(`Invalid manifest at ${filePath}. Did you use defineManifest()?`);
  }

  return manifest as Manifest;
}

/**
 * Returns the default config file path for a given project root.
 */
export function defaultConfigPath(projectRoot: string): string {
  return path.resolve(projectRoot, CONFIG_FILENAME);
}
