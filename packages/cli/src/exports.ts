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
