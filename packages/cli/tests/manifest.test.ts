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
