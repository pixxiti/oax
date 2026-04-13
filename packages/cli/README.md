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
