#!/usr/bin/env node
/**
 * Adds .js extensions to relative imports in compiled ESM output.
 * Usage: node scripts/fix-esm-imports.mjs <dist-dir>
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: fix-esm-imports.mjs <dist-dir>");
  process.exit(1);
}

function walk(d) {
  for (const entry of readdirSync(d)) {
    const full = join(d, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith(".js")) {
      fix(full);
    }
  }
}

function fix(file) {
  const src = readFileSync(file, "utf-8");
  // Match: from "./foo" or from '../bar/baz' — but not already ending in .js
  const out = src.replace(
    /(from\s+['"])(\.\.?\/[^'"]+?)(?<!\.js)(['"])/g,
    "$1$2.js$3",
  );
  if (out !== src) writeFileSync(file, out);
}

walk(dir);
