import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type Operations,
  ValidationError,
  createClient,
  createKyValidationHooks,
  createValidationHelpers,
} from "../src/index";

// Mock ky for integration testing
vi.mock("ky", () => {
  // Create a mock HTTPError class
  class MockHTTPError extends Error {
    constructor(
      public response: Response,
      public request: Request,
      public options: any
    ) {
      super("HTTP Error");
    }
  }

  let currentHooks: any = null;

  const mockKy = vi.fn().mockImplementation(async () => {
    // Default mock response for base ky calls
    return {
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
    };
  });

  (mockKy as any).create = vi.fn().mockImplementation((config: any) => {
    currentHooks = config.hooks;

    const instanceKy = vi.fn().mockImplementation(async (url: string, options: any) => {
      // Simulate beforeRequest hooks
      if (currentHooks?.beforeRequest) {
        const request = new Request(`https://example.com/${url}`, {
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.json ? JSON.stringify(options.json) : undefined,
        });

        for (const hook of currentHooks.beforeRequest) {
          hook(request, options);
        }
      }

      // Check if mockKy has been overridden for this test
      if (mockKy.getMockImplementation()) {
        return mockKy(url, options);
      }

      // Return default response - individual tests will override this
      return {
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
      };
    });

    return instanceKy;
  });

  (mockKy as any).extend = vi.fn().mockReturnValue(mockKy);

  return {
    default: mockKy,
    HTTPError: MockHTTPError,
  };
});

describe("Integration Tests", () => {
  let consoleSpy: any;

  const petStoreOperations = {
    getPetById: {
      operationId: "getPetById",
      method: "get",
      path: "/pet/{petId}",
      params: z.object({
        petId: z.number().int().positive(),
      }),
      queries: z.object({}),
      headers: z.object({}),
      requestBody: undefined,
      responses: {
        "200": {
          description: "successful operation",
          schema: z.object({
            id: z.number().int().positive(),
            category: z
              .object({
                id: z.number().int().positive(),
                name: z.string(),
              })
              .optional(),
            name: z.string(),
            photoUrls: z.array(z.string()),
            tags: z
              .array(
                z.object({
                  id: z.number().int().positive(),
                  name: z.string(),
                })
              )
              .optional(),
            status: z.enum(["available", "pending", "sold"]).optional(),
          }),
        },
        "404": {
          description: "Pet not found",
          schema: z.object({
            code: z.number(),
            type: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    addPet: {
      operationId: "addPet",
      method: "post",
      path: "/pet",
      params: z.object({}),
      queries: z.object({}),
      headers: z.object({}),
      requestBody: {
        schema: z.object({
          id: z.number().int().positive().optional(),
          category: z
            .object({
              id: z.number().int().positive(),
              name: z.string(),
            })
            .optional(),
          name: z.string().min(1),
          photoUrls: z.array(z.string()),
          tags: z
            .array(
              z.object({
                id: z.number().int().positive(),
                name: z.string(),
              })
            )
            .optional(),
          status: z.enum(["available", "pending", "sold"]).optional(),
        }),
        required: true,
      },
      responses: {
        "201": {
          description: "Pet created",
          schema: z.object({
            id: z.number().int().positive(),
            name: z.string(),
            status: z.string(),
          }),
        },
      },
    },
    updatePetWithForm: {
      operationId: "updatePetWithForm",
      method: "post",
      path: "/pet/{petId}",
      params: z.object({
        petId: z.number().int().positive(),
      }),
      queries: z.object({
        name: z.string().optional(),
        status: z.enum(["available", "pending", "sold"]).optional(),
      }),
      headers: z.object({}),
      requestBody: undefined,
      responses: {
        "200": {
          description: "Pet updated",
        },
      },
    },
  } as const satisfies Operations;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("End-to-End Client Usage", () => {
    it("should create fully functional client with validation", async () => {
      const ky = await import("ky");
      const mockPetData = {
        id: 123,
        name: "Fluffy",
        category: { id: 1, name: "Cats" },
        photoUrls: ["https://example.com/photo.jpg"],
        tags: [{ id: 1, name: "cute" }],
        status: "available" as const,
      };

      const mockResponse = {
        json: vi.fn().mockResolvedValue(mockPetData),
        headers: new Map([["content-type", "application/json"]]),
        status: 200,
      };

      (ky.default as any).mockResolvedValue(mockResponse);

      const client = createClient("https://petstore.swagger.io/v2", petStoreOperations);

      const result = await client.getPetById({ params: { petId: 123 } });

      expect(result).toEqual(mockPetData);
      expect(ky.default).toHaveBeenCalledWith(
        "pet/123",
        expect.objectContaining({
          method: "GET",
        })
      );
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should validate request parameters and throw readable errors", async () => {
      const client = createClient("https://petstore.swagger.io/v2", petStoreOperations);

      try {
        await client.getPetById({ params: { petId: -1 } }); // negative ID fails validation
        expect.fail("Should have thrown ValidationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.type).toBe("request");
        expect(validationError.operation).toBe("getPetById");

        const consoleOutput = validationError.toConsoleString();
        expect(consoleOutput).toContain("🚫 Request validation error");
        expect(consoleOutput).toContain("petId");
        expect(consoleSpy).toHaveBeenCalledWith(consoleOutput);
      }
    });

    it("should validate request body for POST operations", async () => {
      const client = createClient("https://petstore.swagger.io/v2", petStoreOperations);

      const invalidPet = {
        name: "", // fails min(1) validation
        photoUrls: ["url1"],
        // missing required fields
      };

      try {
        await client.addPet({}, invalidPet);
        expect.fail("Should have thrown ValidationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.type).toBe("request");
        expect(validationError.operation).toBe("addPet");
        expect(consoleSpy).toHaveBeenCalled();
      }
    });

    it("should validate response data and throw errors for invalid responses", async () => {
      const ky = await import("ky");
      const invalidResponseData = {
        id: "not-a-number", // should be number
        name: "Fluffy",
        photoUrls: ["url1"],
      };

      const mockResponse = {
        json: vi.fn().mockResolvedValue(invalidResponseData),
        headers: new Map([["content-type", "application/json"]]),
        status: 200,
      };

      (ky.default as any).mockResolvedValue(mockResponse);

      const client = createClient("https://petstore.swagger.io/v2", petStoreOperations);

      try {
        await client.getPetById({ params: { petId: 123 } });
        // expect.fail("Should have thrown ValidationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.type).toBe("response");
        expect(validationError.operation).toBe("getPetById");
        expect(consoleSpy).toHaveBeenCalled();
      }
    });

    it("should work with validation disabled", async () => {
      const ky = await import("ky");
      const invalidData = {
        id: "not-a-number",
        name: "",
        photoUrls: "not-an-array",
      };

      const mockResponse = {
        json: vi.fn().mockResolvedValue(invalidData),
        headers: new Map([["content-type", "application/json"]]),
        status: 200,
      };

      (ky.default as any).mockResolvedValue(mockResponse);

      const client = createClient("https://petstore.swagger.io/v2", petStoreOperations, {
        validate: false,
      });

      // These would normally fail validation but should pass with validation disabled
      const result = await client.getPetById({ params: { petId: -1 } });

      expect(result).toEqual(invalidData);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should handle complex parameter combinations", async () => {
      const ky = await import("ky");
      const mockResponse = {
        json: vi.fn(),
        text: vi.fn(),
        headers: new Map([["content-type", "application/json"]]),
        status: 200,
      };

      (ky.default as any).mockResolvedValue(mockResponse);

      const client = createClient("https://petstore.swagger.io/v2", petStoreOperations);

      await client.updatePetWithForm({
        params: { petId: 123 },
        queries: { name: "NewName", status: "pending" },
      });

      // Verify URL construction and parameter handling
      expect(ky.default).toHaveBeenCalledWith(
        "pet/123",
        expect.objectContaining({
          method: "POST",
          searchParams: expect.any(URLSearchParams),
        })
      );

      const call = (ky.default as any).mock.calls[0];
      const searchParams = call[1].searchParams as URLSearchParams;
      expect(searchParams.get("name")).toBe("NewName");
      expect(searchParams.get("status")).toBe("pending");
    });
  });

  describe("Custom Validation Hook Integration", () => {
    it("should work with custom ky hooks", () => {
      const helpers = createValidationHelpers();
      const hooks = createKyValidationHooks(helpers);

      expect(typeof hooks.beforeRequest).toBe("function");
      expect(typeof hooks.afterResponse).toBe("function");

      // Test that hooks can be created and used
      const mockRequest = new Request("https://example.com/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      const mockOptions = {
        params: { petId: 123 },
        body: {
          name: "Fluffy",
          photoUrls: ["url1"],
        },
      };

      const result = hooks.beforeRequest(mockRequest, mockOptions, petStoreOperations.addPet);
      expect(result).toBe(mockRequest);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should integrate validation helpers with real Zod schemas", () => {
      const helpers = createValidationHelpers();

      // Test parameter validation
      const validParams = { params: { petId: 123 } };
      const result1 = helpers.validateRequestParams?.(validParams, petStoreOperations.getPetById);
      expect(result1).toBe(validParams);

      // Test body validation with transformation
      const bodyWithExtra = {
        name: "Fluffy",
        photoUrls: ["url1"],
        extraField: "will be removed",
      };
      const result2 = helpers.validateRequestBody?.(bodyWithExtra, petStoreOperations.addPet);
      expect(result2).toEqual({
        name: "Fluffy",
        photoUrls: ["url1"],
      });

      // Test response validation
      const validResponse = {
        id: 123,
        name: "Fluffy",
        photoUrls: ["url1"],
      };
      const result3 = helpers.validateResponseData?.(
        validResponse,
        petStoreOperations.getPetById,
        "200"
      );
      expect(result3).toEqual(validResponse);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle operations without parameters", async () => {
      const simpleOperation = {
        operationId: "simple",
        method: "get" as const,
        path: "/simple",
        params: z.object({}),
        queries: z.object({}),
        headers: z.object({}),
        responses: {
          "200": {
            description: "OK",
            schema: z.string(),
          },
        },
      };

      const ky = await import("ky");
      const mockResponse = {
        json: vi.fn().mockResolvedValue("simple response"),
        headers: new Map([["content-type", "application/json"]]),
        status: 200,
      };

      (ky.default as any).mockResolvedValue(mockResponse);

      const client = createClient("https://example.com", { simple: simpleOperation });

      const result = await client.simple({});
      expect(result).toBe("simple response");
    });

    it("should handle operations without response schemas", async () => {
      const noSchemaOperation = {
        operationId: "noSchema",
        method: "delete" as const,
        path: "/resource/{id}",
        params: z.object({
          id: z.string(),
        }),
        queries: z.object({}),
        headers: z.object({}),
        responses: {
          "204": {
            description: "No content",
          },
        },
      } as const;

      const ky = await import("ky");
      const mockResponse = {
        json: vi.fn(),
        text: vi.fn(),
        headers: new Map([["content-type", "application/json"]]),
        status: 204,
      };

      (ky.default as any).mockResolvedValue(mockResponse);

      const client = createClient("https://example.com", { noSchema: noSchemaOperation });

      const result = await client.noSchema({ params: { id: "test123" } });
      expect(result).toBeUndefined();
    });

    it("should provide detailed error information in ValidationError", () => {
      const helpers = createValidationHelpers();

      try {
        helpers.validateRequestBody?.(
          {
            name: "",
            photoUrls: "not-array",
            invalidField: true,
          },
          petStoreOperations.addPet
        );
        expect.fail("Should have thrown ValidationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;

        expect(validationError.type).toBe("request");
        expect(validationError.operation).toBe("addPet");
        expect(validationError.data).toEqual({
          name: "",
          photoUrls: "not-array",
          invalidField: true,
        });

        // Check that error includes multiple validation issues
        expect(validationError.zodError.issues.length).toBeGreaterThan(0);

        const consoleOutput = validationError.toConsoleString();
        expect(consoleOutput).toContain("🚫 Request");
        expect(consoleOutput).toContain("addPet");
        expect(consoleOutput).toContain("photoUrls");
      }
    });
  });
});
