import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type Operation,
  ValidationError,
  type ValidationHelpers,
  createValidationHelpers,
} from "../src/index";

describe("createValidationHelpers", () => {
  let helpers: ValidationHelpers;

  beforeEach(() => {
    helpers = createValidationHelpers();
  });

  // Type assertion helpers for tests since we know these methods exist
  const assertValidateRequestParams = (helpers: ValidationHelpers) => {
    if (!helpers.validateRequestParams) throw new Error("validateRequestParams should exist");
    return helpers.validateRequestParams;
  };

  const assertValidateRequestBody = (helpers: ValidationHelpers) => {
    if (!helpers.validateRequestBody) throw new Error("validateRequestBody should exist");
    return helpers.validateRequestBody;
  };

  const assertValidateResponseData = (helpers: ValidationHelpers) => {
    if (!helpers.validateResponseData) throw new Error("validateResponseData should exist");
    return helpers.validateResponseData;
  };

  describe("validateRequestParams", () => {
    const operation: Operation = {
      operationId: "testOperation",
      method: "get",
      path: "/test/{id}",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: z.string(),
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: z.number().int().min(1).max(100),
        },
        {
          name: "authorization",
          in: "header",
          required: true,
          schema: z.string().min(1),
        },
      ],
      requestBody: undefined,
      responses: {
        "200": {
          description: "Success",
          schema: z.object({ message: z.string() }),
        },
      },
    };

    it("should validate valid parameters successfully", () => {
      const params = {
        id: "123",
        limit: 50,
        authorization: "Bearer token123",
      };

      const result = assertValidateRequestParams(helpers)(params, operation);
      expect(result).toBe(params);
    });

    it("should validate when optional parameters are missing", () => {
      const params = {
        id: "123",
        authorization: "Bearer token123",
      };

      const result = assertValidateRequestParams(helpers)(params, operation);
      expect(result).toBe(params);
    });

    it("should throw ValidationError for missing required parameters", () => {
      const params = {
        id: "123",
        // missing required authorization header
      };

      expect(() => {
        assertValidateRequestParams(helpers)(params, operation);
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for invalid parameter types", () => {
      const params = {
        id: "123",
        limit: "not-a-number", // should be number
        authorization: "Bearer token123",
      };

      expect(() => {
        assertValidateRequestParams(helpers)(params, operation);
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for parameters that fail schema validation", () => {
      const params = {
        id: "123",
        limit: 150, // exceeds max of 100
        authorization: "Bearer token123",
      };

      expect(() => {
        assertValidateRequestParams(helpers)(params, operation);
      }).toThrow(ValidationError);
    });

    it("should return params unchanged when no parameters in operation", () => {
      const operationWithoutParams: Operation = {
        ...operation,
        parameters: [],
      };
      const params = { someData: "test" };

      const result = assertValidateRequestParams(helpers)(params, operationWithoutParams);
      expect(result).toBe(params);
    });

    it("should return params unchanged when params is null", () => {
      const result = assertValidateRequestParams(helpers)(null, operation);
      expect(result).toBe(null);
    });

    it("should handle parameters without schemas gracefully", () => {
      const operationWithoutSchemas: Operation = {
        ...operation,
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: null, // no schema
          },
        ],
      };
      const params = { id: "123" };

      const result = assertValidateRequestParams(helpers)(params, operationWithoutSchemas);
      expect(result).toBe(params);
    });

    it("should include parameter name in validation error path", () => {
      const params = {
        id: "", // empty string fails z.string().min(1) for authorization
        authorization: "",
      };

      try {
        // @ts-expect-error - we want to test the error case
        helpers?.validateRequestParams(params, operation);
        expect.fail("Should have thrown ValidationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(
          validationError.zodError.issues.some((issue) => issue.path.includes("authorization"))
        ).toBe(true);
      }
    });
  });

  describe("validateRequestBody", () => {
    const operation: Operation = {
      operationId: "createUser",
      method: "post",
      path: "/users",
      parameters: [],
      requestBody: {
        schema: z.object({
          name: z.string().min(1),
          email: z.email(),
          age: z.number().int().min(0).max(120),
        }),
        required: true,
      },
      responses: {
        "201": {
          description: "Created",
          schema: z.object({ id: z.string(), name: z.string() }),
        },
      },
    };

    it("should validate valid request body successfully", () => {
      const body = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
      };

      const result = assertValidateRequestBody(helpers)(body, operation);
      expect(result).toEqual(body);
    });

    it("should throw ValidationError for invalid request body", () => {
      const body = {
        name: "", // fails min(1)
        email: "invalid-email", // fails email validation
        age: -5, // fails min(0)
      };

      expect(() => {
        assertValidateRequestBody(helpers)(body, operation);
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for missing required fields", () => {
      const body = {
        name: "John Doe",
        // missing email and age
      };

      expect(() => {
        assertValidateRequestBody(helpers)(body, operation);
      }).toThrow(ValidationError);
    });

    it("should return body unchanged when no request body schema", () => {
      const operationWithoutBody: Operation = {
        ...operation,
        requestBody: undefined,
      };
      const body = { someData: "test" };

      const result = assertValidateRequestBody(helpers)(body, operationWithoutBody);
      expect(result).toBe(body);
    });

    it("should return body unchanged when body is null", () => {
      const result = assertValidateRequestBody(helpers)(null, operation);
      expect(result).toBe(null);
    });

    it("should handle request body without schema gracefully", () => {
      const operationWithoutSchema: Operation = {
        ...operation,
        requestBody: {
          schema: null,
          required: true,
        },
      };
      const body = { someData: "test" };

      const result = assertValidateRequestBody(helpers)(body, operationWithoutSchema);
      expect(result).toBe(body);
    });

    it("should return validated data from Zod parse", () => {
      const body = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        extraField: "should be removed", // Zod will strip unknown fields
      };

      const result = assertValidateRequestBody(helpers)(body, operation);
      expect(result).toEqual({
        name: "John Doe",
        email: "john@example.com",
        age: 30,
      });
    });
  });

  describe("validateResponseData", () => {
    const operation: Operation = {
      operationId: "getUser",
      method: "get",
      path: "/users/{id}",
      parameters: [],
      requestBody: undefined,
      responses: {
        "200": {
          description: "Success",
          schema: z.object({
            id: z.string(),
            name: z.string(),
            email: z.email(),
          }),
        },
        "404": {
          description: "Not found",
          schema: z.object({
            error: z.string(),
            code: z.number(),
          }),
        },
      },
    };

    it("should validate valid response data successfully", () => {
      const data = {
        id: "user123",
        name: "John Doe",
        email: "john@example.com",
      };

      const result = assertValidateResponseData(helpers)(data, operation, "200");
      expect(result).toEqual(data);
    });

    it("should validate response data for different status codes", () => {
      const errorData = {
        error: "User not found",
        code: 404,
      };

      const result = assertValidateResponseData(helpers)(errorData, operation, "404");
      expect(result).toEqual(errorData);
    });

    it("should throw ValidationError for invalid response data", () => {
      const data = {
        id: "user123",
        name: "John Doe",
        email: "invalid-email", // fails email validation
      };

      expect(() => {
        assertValidateResponseData(helpers)(data, operation, "200");
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for missing required fields", () => {
      const data = {
        id: "user123",
        // missing name and email
      };

      expect(() => {
        assertValidateResponseData(helpers)(data, operation, "200");
      }).toThrow(ValidationError);
    });

    it("should return data unchanged when no response schema", () => {
      const operationWithoutSchema: Operation = {
        ...operation,
        responses: {
          "200": {
            description: "Success",
            // no schema
          },
        },
      };
      const data = { someData: "test" };

      const result = assertValidateResponseData(helpers)(data, operationWithoutSchema, "200");
      expect(result).toBe(data);
    });

    it("should return data unchanged when response not found", () => {
      const data = { someData: "test" };

      const result = assertValidateResponseData(helpers)(data, operation, "500");
      expect(result).toBe(data);
    });

    it("should default to status 200 when no status provided", () => {
      const data = {
        id: "user123",
        name: "John Doe",
        email: "john@example.com",
      };

      const result = assertValidateResponseData(helpers)(data, operation);
      expect(result).toEqual(data);
    });

    it("should handle response schema without safeParse gracefully", () => {
      const operationWithInvalidSchema: Operation = {
        ...operation,
        responses: {
          "200": {
            description: "Success",
            schema: "not-a-zod-schema",
          },
        },
      };
      const data = { someData: "test" };

      const result = assertValidateResponseData(helpers)(data, operationWithInvalidSchema, "200");
      expect(result).toBe(data);
    });
  });
});
