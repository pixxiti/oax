import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "../src/index";

describe("ValidationError", () => {
  describe("constructor", () => {
    it("should create ValidationError for request validation failure", () => {
      const schema = z.object({ name: z.string() });
      const result = schema.safeParse({ name: 123 });
      if (result.success) throw new Error("Expected validation to fail");
      const zodError = result.error;

      const error = new ValidationError("request", "createUser", zodError, { name: 123 });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe("ValidationError");
      expect(error.type).toBe("request");
      expect(error.operation).toBe("createUser");
      expect(error.zodError).toBe(zodError);
      expect(error.data).toEqual({ name: 123 });
      expect(error.message).toBe("Request validation failed for operation createUser");
    });

    it("should create ValidationError for response validation failure", () => {
      const schema = z.object({ id: z.string() });
      const result = schema.safeParse({ name: "John" });
      if (result.success) throw new Error("Expected validation to fail");
      const zodError = result.error;

      const error = new ValidationError("response", "getUser", zodError, { name: "John" });

      expect(error.type).toBe("response");
      expect(error.operation).toBe("getUser");
      expect(error.zodError).toBe(zodError);
      expect(error.data).toEqual({ name: "John" });
      expect(error.message).toBe("Response validation failed for operation getUser");
    });
  });

  describe("toConsoleString", () => {
    it("should format request validation error with single issue", () => {
      const schema = z.object({ name: z.string() });
      const result = schema.safeParse({ name: 123 });
      if (result.success) throw new Error("Expected validation to fail");
      const zodError = result.error;

      const error = new ValidationError("request", "createUser", zodError, { name: 123 });
      const consoleString = error.toConsoleString();

      expect(consoleString).toContain("🚫 Request validation error in operation: createUser");
      expect(consoleString).toContain("Validation errors:");
      expect(consoleString).toContain("• name:");
      expect(consoleString).toContain('Data received: {\n  "name": 123\n}');
    });

    it("should format response validation error with multiple issues", () => {
      const schema = z.object({ id: z.string(), email: z.string() });
      const result = schema.safeParse({ email: 123 });
      if (result.success) throw new Error("Expected validation to fail");
      const zodError = result.error;

      const error = new ValidationError("response", "getUser", zodError, { email: 123 });
      const consoleString = error.toConsoleString();

      expect(consoleString).toContain("⚠️ Response validation error in operation: getUser");
      expect(consoleString).toContain("• id:");
      expect(consoleString).toContain("• email:");
      expect(consoleString).toContain('Data received: {\n  "email": 123\n}');
    });

    it("should handle nested path in validation errors", () => {
      const zodError = new z.ZodError([
        {
          code: "invalid_type",
          expected: "string",
          path: ["user", "profile", "name"],
          message: "Expected string, received number",
        },
      ]);

      const error = new ValidationError("request", "updateProfile", zodError, {
        user: { profile: { name: 123 } },
      });
      const consoleString = error.toConsoleString();

      expect(consoleString).toContain("• user.profile.name: Expected string, received number");
    });

    it("should handle root-level validation errors", () => {
      const zodError = new z.ZodError([
        {
          code: "invalid_type",
          expected: "object",
          path: [],
          message: "Expected object, received string",
        },
      ]);

      const error = new ValidationError("request", "createUser", zodError, "invalid-data");
      const consoleString = error.toConsoleString();

      expect(consoleString).toContain("• root: Expected object, received string");
      expect(consoleString).toContain('Data received: "invalid-data"');
    });

    it("should format complex nested data correctly", () => {
      const zodError = new z.ZodError([
        {
          code: "invalid_type",
          expected: "string",
          path: ["name"],
          message: "Expected string, received number",
        },
      ]);

      const complexData = {
        name: 123,
        nested: {
          array: [1, 2, 3],
          boolean: true,
          null_value: null,
        },
      };

      const error = new ValidationError("response", "complexOperation", zodError, complexData);
      const consoleString = error.toConsoleString();

      expect(consoleString).toContain('"name": 123');
      expect(consoleString).toContain('"nested": {');
      expect(consoleString).toContain('"array": [');
      expect(consoleString).toContain('"boolean": true');
      expect(consoleString).toContain('"null_value": null');
    });

    it("should handle undefined and null data gracefully", () => {
      const zodError = new z.ZodError([
        {
          code: "invalid_type",
          expected: "object",
          path: [],
          message: "Required",
        },
      ]);

      const errorWithUndefined = new ValidationError("request", "test", zodError, undefined);
      expect(errorWithUndefined.toConsoleString()).toContain("Data received: undefined");

      const errorWithNull = new ValidationError("request", "test", zodError, null);
      expect(errorWithNull.toConsoleString()).toContain("Data received: null");
    });

    it("should maintain proper formatting structure", () => {
      const zodError = new z.ZodError([
        {
          code: "invalid_type",
          expected: "string",
          path: ["test"],
          message: "Test error",
        },
      ]);

      const error = new ValidationError("request", "testOp", zodError, { test: 123 });
      const consoleString = error.toConsoleString();
      const lines = consoleString.split("\n");

      expect(lines[0]).toBe("🚫 Request validation error in operation: testOp");
      expect(lines[1]).toBe("");
      expect(lines[2]).toBe("Validation errors:");
      expect(lines[3]).toBe("  • test: Test error");
      expect(lines[4]).toBe("");
      expect(lines[5]).toBe("Data received: {");
    });
  });

  describe("error properties", () => {
    it("should be instanceof Error and ValidationError", () => {
      const zodError = new z.ZodError([]);
      const error = new ValidationError("request", "test", zodError, {});

      expect(error instanceof Error).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });

    it("should preserve all constructor arguments as readonly properties", () => {
      const zodError = new z.ZodError([]);
      const data = { test: "data" };
      const error = new ValidationError("response", "testOperation", zodError, data);

      expect(error.type).toBe("response");
      expect(error.operation).toBe("testOperation");
      expect(error.zodError).toBe(zodError);
      expect(error.data).toBe(data);

      // Properties should be readonly (TypeScript compile-time check)
      // This is mainly for documentation, as runtime readonly enforcement isn't standard
    });

    it("should have correct error name", () => {
      const zodError = new z.ZodError([]);
      const error = new ValidationError("request", "test", zodError, {});

      expect(error.name).toBe("ValidationError");
    });
  });
});
