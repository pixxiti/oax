import * as path from "path";
import type { OpenAPIV3 } from "openapi-types";
import { beforeAll, describe, expect, it } from "vitest";
import { generateClient, parseOAS } from "../src/generator";

describe("Comprehensive OAS 3.0 Features", () => {
  const testFixturePath = path.resolve(__dirname, "fixtures/comprehensive.json");
  let oas: OpenAPIV3.Document;
  let clientCode: string;

  beforeAll(async () => {
    oas = await parseOAS(testFixturePath);
    clientCode = await generateClient(oas);
  });

  describe("String format validations", () => {
    it("should generate email validation", () => {
      expect(clientCode).toContain("z.email()");
    });

    it("should generate UUID validation", () => {
      expect(clientCode).toContain("z.string().uuid()");
    });

    it("should generate datetime validation", () => {
      expect(clientCode).toContain("z.iso.datetime()");
    });

    it("should generate date validation", () => {
      expect(clientCode).toContain("z.string().date()");
    });

    it("should generate URI validation", () => {
      expect(clientCode).toContain("z.url()");
    });

    it("should generate IPv4 validation", () => {
      expect(clientCode).toContain('z.string().ip({ version: "v4" })');
    });
  });

  describe("String constraints", () => {
    it("should generate minLength constraint", () => {
      expect(clientCode).toMatch(/\.min\(3\)/);
    });

    it("should generate maxLength constraint", () => {
      expect(clientCode).toMatch(/\.max\(20\)/);
      expect(clientCode).toMatch(/\.max\(50\)/);
      expect(clientCode).toMatch(/\.max\(500\)/);
    });

    it("should generate regex pattern validation", () => {
      expect(clientCode).toMatch(/\.regex\(\/.*\/\)/);
      expect(clientCode).toContain("/^[a-zA-Z0-9_]+$/");
    });
  });

  describe("Number constraints", () => {
    it("should generate integer with min/max constraints", () => {
      expect(clientCode).toMatch(/\.gte\(13\)/);
      expect(clientCode).toMatch(/\.lte\(120\)/);
      expect(clientCode).toMatch(/\.int\(\)/);
    });

    it("should generate number with multipleOf constraint", () => {
      expect(clientCode).toMatch(/\.multipleOf\(0\.1\)/);
      expect(clientCode).toMatch(/\.gte\(0\)/);
      expect(clientCode).toMatch(/\.lte\(100\)/);
    });
  });

  describe("Array constraints", () => {
    it("should generate minItems constraint", () => {
      expect(clientCode).toMatch(/z\.array\(z\.string\(\)\)/);
      expect(clientCode).toMatch(/\.min\(0\)/);
    });

    it("should generate maxItems constraint", () => {
      expect(clientCode).toMatch(/z\.array\(z\.string\(\)\)/);
      expect(clientCode).toMatch(/\.max\(10\)/);
    });

    it("should generate uniqueItems constraint", () => {
      expect(clientCode).toMatch(/\.refine\(\(items\) => new Set\(items\)\.size === items\.length/);
      expect(clientCode).toMatch(/"Items must be unique"/);
    });
  });

  describe("Object constraints", () => {
    it("should generate strict object (additionalProperties: false)", () => {
      expect(clientCode).toContain(".strict()");
    });

    it("should generate passthrough object (additionalProperties: true)", () => {
      expect(clientCode).toContain(".passthrough()");
    });

    it("should generate typed record for additionalProperties with schema", () => {
      expect(clientCode).toContain("z.record(z.string(), z.string())");
    });

    it("should generate minProperties constraint", () => {
      expect(clientCode).toMatch(/\.refine\(\(obj\) => Object\.keys\(obj\)\.length >= 1/);
    });

    it("should generate maxProperties constraint", () => {
      expect(clientCode).toMatch(/\.refine\(\(obj\) => Object\.keys\(obj\)\.length <= 10/);
    });
  });

  describe("Nullable support", () => {
    it("should generate nullable fields", () => {
      expect(clientCode).toContain("z.string().date().nullable()");
    });
  });

  describe("Deprecated properties", () => {
    it("should mark deprecated fields with comments", () => {
      expect(clientCode).toContain("legacyField: z.string().optional() /* @deprecated */");
    });
  });

  describe("Composition operators", () => {
    it("should generate allOf as intersection", () => {
      expect(clientCode).toContain("z.intersection(");
    });

    it("should generate anyOf as union", () => {
      expect(clientCode).toContain("z.union([");
    });

    it("should generate oneOf as union", () => {
      // BasicProfile and PremiumProfile should be generated as union in Profile
      expect(clientCode).toContain("z.union([");
    });

    it("should generate discriminated union for oneOf with discriminator", () => {
      expect(clientCode).toContain('z.discriminatedUnion("type"');
    });
  });

  describe("Schema references", () => {
    it("should generate all schema exports", () => {
      expect(clientCode).toContain("export const User =");
      expect(clientCode).toContain("export const CreateUserRequest =");
      expect(clientCode).toContain("export const Profile =");
      expect(clientCode).toContain("export const BasicProfile =");
      expect(clientCode).toContain("export const PremiumProfile =");
      expect(clientCode).toContain("export const BaseProfile =");
      expect(clientCode).toContain("export const SearchFilter =");
      expect(clientCode).toContain("export const Configuration =");
    });

    it("should generate schemas object with all schemas", () => {
      expect(clientCode).toContain("export const schemas =");
      expect(clientCode).toContain("User,");
      expect(clientCode).toContain("CreateUserRequest,");
      expect(clientCode).toContain("Profile,");
    });
  });

  describe("Operations generation", () => {
    it("should generate operations with path parameters", () => {
      expect(clientCode).toContain("userId");
      expect(clientCode).toContain("params: z.object({ userId");
      expect(clientCode).toContain("required: true");
    });

    it("should generate request body schemas", () => {
      expect(clientCode).toContain("requestBody:");
      expect(clientCode).toContain("CreateUserRequest");
    });

    it("should generate response schemas", () => {
      expect(clientCode).toContain("responses:");
      expect(clientCode).toContain('"200":');
      expect(clientCode).toContain('"201":');
    });
  });

  describe("Type safety", () => {
    it("should generate syntactically valid TypeScript", () => {
      // Check for balanced parentheses and brackets
      const openParens = (clientCode.match(/\(/g) || []).length;
      const closeParens = (clientCode.match(/\)/g) || []).length;
      const openBrackets = (clientCode.match(/\[/g) || []).length;
      const closeBrackets = (clientCode.match(/\]/g) || []).length;
      const openBraces = (clientCode.match(/\{/g) || []).length;
      const closeBraces = (clientCode.match(/\}/g) || []).length;

      expect(openParens).toBe(closeParens);
      expect(openBrackets).toBe(closeBrackets);
      expect(openBraces).toBe(closeBraces);
    });

    it("should not contain obvious syntax errors", () => {
      // Check that there are no obvious syntax errors
      expect(clientCode).not.toMatch(/\(\s*,/); // No leading commas in function calls
      expect(clientCode).not.toMatch(/\[\s*,/); // No leading commas in arrays
      // Note: Prettier may add trailing commas in some contexts, so we don't test for that
    });
  });

  describe("Edge cases", () => {
    it("should handle empty schemas gracefully", () => {
      // The generator should not crash with empty or null schemas
      expect(clientCode).toBeDefined();
      expect(clientCode.length).toBeGreaterThan(0);
    });

    it("should handle complex nested schemas", () => {
      // Verify that nested allOf/oneOf/anyOf work correctly
      expect(clientCode).toContain("BaseProfile");
      expect(clientCode).toContain("BasicProfile");
      expect(clientCode).toContain("PremiumProfile");
    });

    it("should preserve required field validation", () => {
      // Check that required fields don't have .optional()
      expect(clientCode).toMatch(/id:\s*z\.string\(\)\.uuid\(\)(?!.*\.optional)/);
      expect(clientCode).toMatch(/email:\s*z\.email\(\)(?!.*\.optional)/);
      expect(clientCode).toMatch(/createdAt:\s*z\.iso\.datetime\(\)(?!.*\.optional)/);
    });

    it("should make optional fields optional", () => {
      // Check that optional fields have .optional()
      expect(clientCode).toMatch(/username:[\s\S]*?\.optional\(\)/);
      expect(clientCode).toMatch(/age:[\s\S]*?\.optional\(\)/);
    });
  });
});
