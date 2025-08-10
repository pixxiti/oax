import path from "path";
import type { OpenAPIV3 } from "openapi-types";
import { beforeAll, describe, expect, it } from "vitest";
import { generateClient, parseOAS } from "../src/generator.js";

describe("zoddy generator", () => {
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
      await expect(parseOAS("nonexistent.json")).rejects.toThrow();
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
      expect(clientCode).toContain('import { z } from "zod/v4"');
      expect(clientCode).toContain(
        'import { createClient as createRuntimeClient } from "@zoddy/core"'
      );
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
      expect(clientCode).toContain('in: "path"');
    });

    it("should generate query parameters correctly", () => {
      expect(clientCode).toContain("limit");
      expect(clientCode).toContain('in: "query"');
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
      expect(clientCode).toContain("parameters:");
      expect(clientCode).toContain("responses:");
    });
  });
});
