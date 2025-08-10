import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type KyValidationHooks,
  type Operation,
  ValidationError,
  type ValidationHelpers,
  createKyValidationHooks,
  createValidationHelpers,
} from "../src/index";

describe("createKyValidationHooks", () => {
  let helpers: ValidationHelpers;
  let hooks: KyValidationHooks;
  let consoleSpy: any;

  const mockOperation: Operation = {
    operationId: "testOperation",
    method: "post",
    path: "/test",
    parameters: [
      {
        name: "id",
        in: "query",
        required: true,
        schema: z.string().min(1),
      },
    ],
    requestBody: {
      schema: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
      required: true,
    },
    responses: {
      "200": {
        description: "Success",
        schema: z.object({
          id: z.string(),
          message: z.string(),
        }),
      },
    },
  };

  beforeEach(() => {
    helpers = createValidationHelpers();
    hooks = createKyValidationHooks(helpers);
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("createKyValidationHooks", () => {
    it("should return hooks object with correct structure", () => {
      expect(hooks).toHaveProperty("beforeRequest");
      expect(hooks).toHaveProperty("afterResponse");
      expect(typeof hooks.beforeRequest).toBe("function");
      expect(typeof hooks.afterResponse).toBe("function");
    });
  });

  describe("beforeRequest hook", () => {
    let mockRequest: Request;
    let mockOptions: any;

    beforeEach(() => {
      mockRequest = new Request("https://api.example.com/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      mockOptions = {
        params: { id: "test123" },
        body: {
          name: "John Doe",
          email: "john@example.com",
        },
      };
    });

    it("should return request unchanged when validation passes", () => {
      const result = hooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      expect(result).toBe(mockRequest);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should validate request parameters and throw ValidationError on failure", () => {
      mockOptions.params = { id: "" }; // fails validation

      expect(() => {
        hooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      }).toThrow(ValidationError);

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should validate request body and throw ValidationError on failure", () => {
      mockOptions.json = {
        name: "", // fails min(1) validation
        email: "invalid-email", // fails email validation
      };
      // biome-ignore lint/performance/noDelete: testing
      delete mockOptions.body; // Use json instead of body for ky

      expect(() => {
        hooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      }).toThrow(ValidationError);

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should return request unchanged when no operation provided", () => {
      const result = hooks.beforeRequest(mockRequest, mockOptions, undefined);
      expect(result).toBe(mockRequest);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should return request unchanged when no params provided", () => {
      mockOptions.params = undefined;
      
      const result = hooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      expect(result).toBe(mockRequest);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should return request unchanged when no body provided", () => {
      mockOptions.body = undefined;
      
      const result = hooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      expect(result).toBe(mockRequest);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should skip body validation when content-type is not JSON", () => {
      const nonJsonRequest = new Request("https://api.example.com/test", {
        method: "POST",
        headers: { "content-type": "text/plain" },
      });

      mockOptions.json = "invalid json body";

      const result = hooks.beforeRequest(nonJsonRequest, mockOptions, mockOperation);
      expect(result).toBe(nonJsonRequest);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should return request unchanged when validation helpers are missing", () => {
      const emptyHelpers: ValidationHelpers = {};
      const emptyHooks = createKyValidationHooks(emptyHelpers);

      const result = emptyHooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      expect(result).toBe(mockRequest);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should re-throw non-ValidationError exceptions", () => {
      // Mock helpers to throw a regular error
      const errorHelpers = {
        validateRequestParams: vi.fn().mockImplementation(() => {
          throw new Error("Regular error");
        }),
        validateRequestBody: vi.fn(),
      };
      const errorHooks = createKyValidationHooks(errorHelpers);

      expect(() => {
        errorHooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      }).toThrow("Regular error");

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("afterResponse hook", () => {
    let mockRequest: Request;
    let mockOptions: any;
    let mockResponse: Response;

    beforeEach(() => {
      mockRequest = new Request("https://api.example.com/test");
      mockOptions = {};
      
      // Mock a successful response
      const mockResponseData = {
        id: "response123",
        message: "Success",
      };

      mockResponse = new Response(JSON.stringify(mockResponseData), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

      // Mock the json method
      vi.spyOn(mockResponse, "json").mockResolvedValue(mockResponseData);
    });

    it("should return response unchanged when no operation provided", async () => {
      const result = await hooks.afterResponse(mockRequest, mockOptions, mockResponse, undefined);
      expect(result).toBe(mockResponse);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should return response unchanged when validation helpers are missing", async () => {
      const emptyHelpers: ValidationHelpers = {};
      const emptyHooks = createKyValidationHooks(emptyHelpers);

      const result = await emptyHooks.afterResponse(mockRequest, mockOptions, mockResponse, mockOperation);
      expect(result).toBe(mockResponse);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should return response unchanged for non-JSON content", async () => {
      const textResponse = new Response("Plain text", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });

      const result = await hooks.afterResponse(mockRequest, mockOptions, textResponse, mockOperation);
      expect(result).toBe(textResponse);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should handle JSON response validation asynchronously", async () => {
      // This test verifies the async validation behavior
      const result = await hooks.afterResponse(mockRequest, mockOptions, mockResponse, mockOperation);
      expect(result).toBe(mockResponse);
      
      // No error should be logged for valid response
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should log validation errors for invalid JSON responses", async () => {
      const invalidResponseData = {
        id: "response123",
        message: 123, // should be string, not number
      };

      const invalidResponse = new Response(JSON.stringify(invalidResponseData), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

      vi.spyOn(invalidResponse, "json").mockResolvedValue(invalidResponseData);

      const result = await hooks.afterResponse(mockRequest, mockOptions, invalidResponse, mockOperation);
      expect(result).toBe(invalidResponse);
      
      // Validation error should be logged
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should handle JSON parsing errors gracefully", async () => {
      const invalidJsonResponse = new Response("invalid json", {
        status: 200,
        headers: { "content-type": "application/json" },
      });

      vi.spyOn(invalidJsonResponse, "json").mockRejectedValue(new Error("JSON parse error"));

      const result = await hooks.afterResponse(mockRequest, mockOptions, invalidJsonResponse, mockOperation);
      expect(result).toBe(invalidJsonResponse);
      
      // Should not crash, no validation error logged since JSON parsing failed first
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should handle validation helper exceptions gracefully", async () => {
      // Mock helpers to throw during validation
      const errorHelpers = {
        validateResponseData: vi.fn().mockImplementation(() => {
          throw new ValidationError("response", "test", new z.ZodError([]), {});
        }),
      };
      const errorHooks = createKyValidationHooks(errorHelpers);

      const result = await errorHooks.afterResponse(mockRequest, mockOptions, mockResponse, mockOperation);
      expect(result).toBe(mockResponse);

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should handle non-ValidationError exceptions in validation", async () => {
      // Mock helpers to throw a regular error
      const errorHelpers = {
        validateResponseData: vi.fn().mockImplementation(() => {
          throw new Error("Regular error");
        }),
      };
      const errorHooks = createKyValidationHooks(errorHelpers);

      const result = await errorHooks.afterResponse(mockRequest, mockOptions, mockResponse, mockOperation);
      expect(result).toBe(mockResponse);

      // Regular errors should also be handled gracefully
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("integration with real ValidationHelpers", () => {
    it("should work with real validation helpers for successful validation", () => {
      const realHelpers = createValidationHelpers();
      const realHooks = createKyValidationHooks(realHelpers);

      const mockRequest = new Request("https://api.example.com/test", {
        method: "POST", 
        headers: { "content-type": "application/json" },
      });

      const mockOptions = {
        params: { id: "valid123" },
        body: {
          name: "John Doe",
          email: "john@example.com",
        },
      };

      const result = realHooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      expect(result).toBe(mockRequest);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should work with real validation helpers for failed validation", () => {
      const realHelpers = createValidationHelpers();
      const realHooks = createKyValidationHooks(realHelpers);

      const mockRequest = new Request("https://api.example.com/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      const mockOptions = {
        params: { id: "" }, // fails validation
        body: {
          name: "John Doe",
          email: "john@example.com",
        },
      };

      expect(() => {
        realHooks.beforeRequest(mockRequest, mockOptions, mockOperation);
      }).toThrow(ValidationError);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});