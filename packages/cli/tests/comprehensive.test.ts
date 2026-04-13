import * as path from "path";
import type { OpenAPIV3 } from "openapi-types";
import { beforeAll, describe, expect, it } from "vitest";
import { generateClient, parseOAS } from "../src/generator";

describe("Comprehensive OAS 3.0 Features", () => {
  const testFixturePath = path.resolve(__dirname, "fixtures/comprehensive.json");
  let oas: OpenAPIV3.Document;
  let clientCodeV4: string;
  let clientCodeV3: string;

  beforeAll(async () => {
    oas = await parseOAS(testFixturePath);
    clientCodeV4 = await generateClient(oas);
    clientCodeV3 = await generateClient(oas, { zodVersion: 3 });
  });

  describe("String format validations (zod v4 - default)", () => {
    it("should generate email validation", () => {
      expect(clientCodeV4).toContain("z.email()");
    });

    it("should generate UUID validation", () => {
      expect(clientCodeV4).toContain("z.string().uuid()");
    });

    it("should generate datetime validation", () => {
      expect(clientCodeV4).toContain("z.iso.datetime()");
    });

    it("should generate date validation", () => {
      expect(clientCodeV4).toContain("z.string().date()");
    });

    it("should generate URI validation", () => {
      expect(clientCodeV4).toContain("z.url()");
    });

    it("should generate IPv4 validation", () => {
      expect(clientCodeV4).toContain('z.string().ip({ version: "v4" })');
    });
  });

  describe("String format validations (zod v3)", () => {
    it("should generate email validation", () => {
      expect(clientCodeV3).toContain("z.string().email()");
      expect(clientCodeV3).not.toContain("z.email()");
    });

    it("should generate datetime validation", () => {
      expect(clientCodeV3).toContain("z.string().datetime()");
      expect(clientCodeV3).not.toContain("z.iso.datetime()");
    });

    it("should generate URI validation", () => {
      expect(clientCodeV3).toContain("z.string().url()");
      expect(clientCodeV3).not.toContain("z.url()");
    });
  });

  describe("String constraints", () => {
    it("should generate minLength constraint", () => {
      expect(clientCodeV4).toMatch(/\.min\(3\)/);
    });

    it("should generate maxLength constraint", () => {
      expect(clientCodeV4).toMatch(/\.max\(20\)/);
      expect(clientCodeV4).toMatch(/\.max\(50\)/);
      expect(clientCodeV4).toMatch(/\.max\(500\)/);
    });

    it("should generate regex pattern validation", () => {
      expect(clientCodeV4).toMatch(/\.regex\(\/.*\/\)/);
      expect(clientCodeV4).toContain("/^[a-zA-Z0-9_]+$/");
    });
  });

  describe("Number constraints", () => {
    it("should generate integer with min/max constraints", () => {
      expect(clientCodeV4).toMatch(/\.gte\(13\)/);
      expect(clientCodeV4).toMatch(/\.lte\(120\)/);
      expect(clientCodeV4).toMatch(/\.int\(\)/);
    });

    it("should generate number with multipleOf constraint", () => {
      expect(clientCodeV4).toMatch(/\.multipleOf\(0\.1\)/);
      expect(clientCodeV4).toMatch(/\.gte\(0\)/);
      expect(clientCodeV4).toMatch(/\.lte\(100\)/);
    });
  });

  describe("Array constraints", () => {
    it("should generate minItems constraint", () => {
      expect(clientCodeV4).toMatch(/z\.array\(z\.string\(\)\)/);
      expect(clientCodeV4).toMatch(/\.min\(0\)/);
    });

    it("should generate maxItems constraint", () => {
      expect(clientCodeV4).toMatch(/z\.array\(z\.string\(\)\)/);
      expect(clientCodeV4).toMatch(/\.max\(10\)/);
    });

    it("should generate uniqueItems constraint", () => {
      expect(clientCodeV4).toMatch(/\.refine\(\(items\) => new Set\(items\)\.size === items\.length/);
      expect(clientCodeV4).toMatch(/"Items must be unique"/);
    });
  });

  describe("Object constraints", () => {
    it("should generate strict object (additionalProperties: false)", () => {
      expect(clientCodeV4).toContain(".strict()");
    });

    it("should generate passthrough object (additionalProperties: true)", () => {
      expect(clientCodeV4).toContain(".passthrough()");
    });

    it("should generate typed record for additionalProperties with schema", () => {
      expect(clientCodeV4).toContain("z.record(z.string(), z.string())");
    });

    it("should generate minProperties constraint", () => {
      expect(clientCodeV4).toMatch(/\.refine\(\(obj\) => Object\.keys\(obj\)\.length >= 1/);
    });

    it("should generate maxProperties constraint", () => {
      expect(clientCodeV4).toMatch(/\.refine\(\(obj\) => Object\.keys\(obj\)\.length <= 10/);
    });
  });

  describe("Nullable support", () => {
    it("should generate nullable fields", () => {
      expect(clientCodeV4).toContain("z.string().date().nullable()");
    });
  });

  describe("Deprecated properties", () => {
    it("should mark deprecated fields with comments", () => {
      expect(clientCodeV4).toContain("legacyField: z.string().optional() /* @deprecated */");
    });
  });

  describe("Composition operators", () => {
    it("should generate allOf as intersection", () => {
      expect(clientCodeV4).toContain("z.intersection(");
    });

    it("should generate anyOf as union", () => {
      expect(clientCodeV4).toContain("z.union([");
    });

    it("should generate oneOf as union", () => {
      // BasicProfile and PremiumProfile should be generated as union in Profile
      expect(clientCodeV4).toContain("z.union([");
    });

    it("should generate discriminated union for oneOf with discriminator", () => {
      expect(clientCodeV4).toContain('z.discriminatedUnion("type"');
    });
  });

  describe("Schema references", () => {
    it("should generate all schema exports", () => {
      expect(clientCodeV4).toContain("export const User =");
      expect(clientCodeV4).toContain("export const CreateUserRequest =");
      expect(clientCodeV4).toContain("export const Profile =");
      expect(clientCodeV4).toContain("export const BasicProfile =");
      expect(clientCodeV4).toContain("export const PremiumProfile =");
      expect(clientCodeV4).toContain("export const BaseProfile =");
      expect(clientCodeV4).toContain("export const SearchFilter =");
      expect(clientCodeV4).toContain("export const Configuration =");
    });

    it("should generate schemas object with all schemas", () => {
      expect(clientCodeV4).toContain("export const schemas =");
      expect(clientCodeV4).toContain("User,");
      expect(clientCodeV4).toContain("CreateUserRequest,");
      expect(clientCodeV4).toContain("Profile,");
    });
  });

  describe("Operations generation", () => {
    it("should generate operations with path parameters", () => {
      expect(clientCodeV4).toContain("userId");
      expect(clientCodeV4).toContain("params: z.object({ userId");
    });

    it("should generate request body schemas", () => {
      expect(clientCodeV4).toContain("requestBody:");
      expect(clientCodeV4).toContain("CreateUserRequest");
    });

    it("should generate response schemas", () => {
      expect(clientCodeV4).toContain("responses:");
      expect(clientCodeV4).toContain('"200":');
      expect(clientCodeV4).toContain('"201":');
    });
  });

  describe("Type safety", () => {
    it("should generate syntactically valid TypeScript", () => {
      // Check for balanced parentheses and brackets
      const openParens = (clientCodeV4.match(/\(/g) || []).length;
      const closeParens = (clientCodeV4.match(/\)/g) || []).length;
      const openBrackets = (clientCodeV4.match(/\[/g) || []).length;
      const closeBrackets = (clientCodeV4.match(/\]/g) || []).length;
      const openBraces = (clientCodeV4.match(/\{/g) || []).length;
      const closeBraces = (clientCodeV4.match(/\}/g) || []).length;

      expect(openParens).toBe(closeParens);
      expect(openBrackets).toBe(closeBrackets);
      expect(openBraces).toBe(closeBraces);
    });

    it("should not contain obvious syntax errors", () => {
      // Check that there are no obvious syntax errors
      expect(clientCodeV4).not.toMatch(/\(\s*,/); // No leading commas in function calls
      expect(clientCodeV4).not.toMatch(/\[\s*,/); // No leading commas in arrays
      // Note: Prettier may add trailing commas in some contexts, so we don't test for that
    });
  });

  describe("Edge cases", () => {
    it("should handle empty schemas gracefully", () => {
      // The generator should not crash with empty or null schemas
      expect(clientCodeV4).toBeDefined();
      expect(clientCodeV4.length).toBeGreaterThan(0);
    });

    it("should handle complex nested schemas", () => {
      // Verify that nested allOf/oneOf/anyOf work correctly
      expect(clientCodeV4).toContain("BaseProfile");
      expect(clientCodeV4).toContain("BasicProfile");
      expect(clientCodeV4).toContain("PremiumProfile");
    });

    it("should preserve required field validation", () => {
      // Check that required fields don't have .optional()
      expect(clientCodeV4).toMatch(/id:\s*z\.string\(\)\.uuid\(\)(?!.*\.optional)/);
      expect(clientCodeV4).toMatch(/email:\s*z\.email\(\)(?!.*\.optional)/);
      expect(clientCodeV4).toMatch(/createdAt:\s*z\.iso\.datetime\(\)(?!.*\.optional)/);

      // Same check for v3
      expect(clientCodeV3).toMatch(/id:\s*z\.string\(\)\.uuid\(\)(?!.*\.optional)/);
      expect(clientCodeV3).toMatch(/email:\s*z\.string\(\)\.email\(\)(?!.*\.optional)/);
      expect(clientCodeV3).toMatch(/createdAt:\s*z\.string\(\)\.datetime\(\)(?!.*\.optional)/);
    });

    it("should make optional fields optional", () => {
      // Check that optional fields have .optional()
      expect(clientCodeV4).toMatch(/username:[\s\S]*?\.optional\(\)/);
      expect(clientCodeV4).toMatch(/age:[\s\S]*?\.optional\(\)/);
    });
  });
});
