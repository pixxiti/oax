import * as path from "path";
import type { OpenAPIV3 } from "openapi-types";
import { beforeAll, describe, expect, it } from "vitest";
import { generateClient, generateOperations, parseOAS } from "../src/generator";

describe("oax generator", () => {
  const testFixturePath = path.resolve(__dirname, "fixtures/petstore.json");

  describe("parseOAS", () => {
    it("should parse a valid OpenAPI specification", async () => {
      const oas = await parseOAS(testFixturePath);

      expect(oas).toBeDefined();
      expect(oas.openapi).toBe("3.0.3");
      expect(oas.info.title).toBe("Petstore API");
      expect(oas.paths).toBeDefined();
      expect(oas.components?.schemas).toBeDefined();
    });

    it("should throw error for invalid OAS file", async () => {
      await expect(parseOAS(path.resolve(__dirname, "nonexistent.json"))).rejects.toThrow();
    });
  });

  describe("generateClient", () => {
    let oas: OpenAPIV3.Document;
    let clientCode: string;

    beforeAll(async () => {
      oas = await parseOAS(testFixturePath);
      clientCode = await generateClient(oas);
    });

    it("should generate client code with correct imports", () => {
      expect(clientCode).toContain('import { z } from "zod"');
      expect(clientCode).toContain("createClient as createRuntimeClient");
      expect(clientCode).toContain("type ClientOptions");
      expect(clientCode).toContain("@oax/core");
    });

    it("should generate schema exports", () => {
      expect(clientCode).toContain("export const Pet =");
      expect(clientCode).toContain("export const NewPet =");
      expect(clientCode).toContain("export const schemas =");
    });

    it("should generate operations export", () => {
      expect(clientCode).toContain("export const operations =");
      expect(clientCode).toContain("listPets");
      expect(clientCode).toContain("createPet");
      expect(clientCode).toContain("getPetById");
    });

    it("should generate createClient function", () => {
      expect(clientCode).toContain("export function createClient");
      expect(clientCode).toContain("createRuntimeClient(baseUrl, operations, options)");
    });

    it("should handle enums correctly", () => {
      expect(clientCode).toContain('z.enum(["available", "pending", "sold"])');
    });

    it("should handle required and optional properties", () => {
      // Pet schema should have required id and name
      expect(clientCode).toMatch(/id:\s*z\.number\(\)\.int\(\)/);
      expect(clientCode).toMatch(/name:\s*z\.string\(\)/);
      // Pet schema should have optional tag
      expect(clientCode).toMatch(/tag:\s*z\.string\(\)\.optional\(\)/);
    });

    it("should generate path parameters correctly", () => {
      expect(clientCode).toContain("petId");
      expect(clientCode).toContain("params: z.object({ petId");
    });

    it("should generate query parameters correctly", () => {
      expect(clientCode).toContain("limit");
      expect(clientCode).toContain("queries: z.object({ limit");
    });

    it("should generate request body schemas", () => {
      expect(clientCode).toContain("requestBody");
      expect(clientCode).toContain("required: true");
    });
  });

  describe("type safety", () => {
    it("should generate TypeScript-valid code", async () => {
      // This test would ideally use TypeScript compiler API
      // For now, we'll check basic structure
      const oas = await parseOAS(testFixturePath);
      const clientCode = await generateClient(oas);

      // Check that all operations have proper typing structure
      expect(clientCode).toContain("method:");
      expect(clientCode).toContain("path:");
      expect(clientCode).toContain("operationId:");
      expect(clientCode).toContain("params:");
      expect(clientCode).toContain("queries:");
      expect(clientCode).toContain("headers:");
      expect(clientCode).toContain("responses:");
    });

    it("should resolve $ref parameters", async () => {
      const testOAS: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/items": {
            get: {
              operationId: "listItems",
              parameters: [
                { $ref: "#/components/parameters/cursor" } as any,
                { $ref: "#/components/parameters/limit" } as any,
              ],
              responses: {
                "200": { description: "OK" },
              },
            },
          },
        },
        components: {
          parameters: {
            cursor: {
              name: "cursor",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            limit: {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer" },
            },
          } as any,
        },
      };

      const ops = generateOperations(testOAS);
      expect(ops).toHaveLength(1);
      const op = ops[0];
      expect(op.parameters).toHaveLength(2);
      expect(op.parameters[0].name).toBe("cursor");
      expect(op.parameters[0].in).toBe("query");
      expect(op.parameters[1].name).toBe("limit");
      expect(op.parameters[1].in).toBe("query");
    });

    it("should resolve $ref responses", async () => {
      const testOAS: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/items": {
            get: {
              operationId: "listItems",
              responses: {
                "200": { $ref: "#/components/responses/ItemList" } as any,
                "401": { $ref: "#/components/responses/Unauthorized" } as any,
              },
            },
          },
        },
        components: {
          responses: {
            ItemList: {
              description: "A list of items",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
            Unauthorized: {
              description: "Not authenticated",
            },
          } as any,
        },
      };

      const ops = generateOperations(testOAS);
      expect(ops).toHaveLength(1);
      const op = ops[0];
      expect(op.responses).toHaveLength(2);

      const resp200 = op.responses.find((r) => r.status === "200");
      expect(resp200).toBeDefined();
      expect(resp200!.description).toBe("A list of items");
      expect(resp200!.schema).toBeDefined();
      expect(resp200!.schema!.zodCode).toContain("z.array");

      const resp401 = op.responses.find((r) => r.status === "401");
      expect(resp401).toBeDefined();
      expect(resp401!.description).toBe("Not authenticated");
    });

    it("should inherit path-level parameters and merge with operation parameters", async () => {
      const testOAS: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/items/{item_id}": {
            // Path-level parameter — inherited by both GET and PATCH
            parameters: [
              {
                name: "item_id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            get: {
              operationId: "getItem",
              responses: {
                "200": { description: "OK" },
              },
            },
            patch: {
              operationId: "updateItem",
              // Operation-level parameter with same name overrides path-level
              parameters: [
                {
                  name: "item_id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                  description: "overridden",
                },
                {
                  name: "dry_run",
                  in: "query",
                  required: false,
                  schema: { type: "boolean" },
                },
              ],
              responses: {
                "200": { description: "OK" },
              },
            },
          } as any,
        },
      };

      const ops = generateOperations(testOAS);
      expect(ops).toHaveLength(2);

      // GET should inherit path-level item_id
      const getOp = ops.find((o) => o.operationId === "getItem")!;
      expect(getOp.parameters).toHaveLength(1);
      expect(getOp.parameters[0].name).toBe("item_id");
      expect(getOp.parameters[0].in).toBe("path");

      // PATCH should have both item_id (from operation, overriding path-level) and dry_run
      const patchOp = ops.find((o) => o.operationId === "updateItem")!;
      expect(patchOp.parameters).toHaveLength(2);
      const paramNames = patchOp.parameters.map((p) => p.name).sort();
      expect(paramNames).toEqual(["dry_run", "item_id"]);
      // Should NOT have duplicated item_id
      expect(patchOp.parameters.filter((p) => p.name === "item_id")).toHaveLength(1);
    });

    it("should resolve $ref path-level parameters", async () => {
      const testOAS: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/items/{item_id}": {
            parameters: [
              { $ref: "#/components/parameters/item_id" } as any,
            ],
            get: {
              operationId: "getItem",
              responses: {
                "200": { description: "OK" },
              },
            },
          } as any,
        },
        components: {
          parameters: {
            item_id: {
              name: "item_id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          } as any,
        },
      };

      const ops = generateOperations(testOAS);
      expect(ops).toHaveLength(1);
      expect(ops[0].parameters).toHaveLength(1);
      expect(ops[0].parameters[0].name).toBe("item_id");
      expect(ops[0].parameters[0].in).toBe("path");
      expect(ops[0].parameters[0].required).toBe(true);
    });

    it("should generate correct z.record syntax for additionalProperties", async () => {
      // Create a test OAS with additionalProperties to verify z.record generation
      const testOAS: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/inventory": {
            get: {
              operationId: "getInventory",
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        additionalProperties: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const clientCode = await generateClient(testOAS);

      // Verify that z.record uses the correct two-parameter syntax
      expect(clientCode).toContain("z.record(z.string(), z.number().int())");
      // Ensure it doesn't use the old single-parameter syntax
      expect(clientCode).not.toContain("z.record(z.number().int())");
      expect(clientCode).not.toContain("z.record(z.any())");
    });
  });
});
