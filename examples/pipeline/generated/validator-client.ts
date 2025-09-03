// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T16:32:03.359Z

import type ky from "ky";
import type { BeforeRequestHook, AfterResponseHook } from "ky";
import type { ZodError, ZodType } from "zod";
import {
  getKyInstance,
  configureClient as baseConfigureClient,
  type KyClientOptions,
} from "./ky-client";
import { operations, type Operations } from "./schemas";

// Use the actual operation type from the operations
type Operation = Operations[keyof Operations];

export class ValidationError extends Error {
  constructor(
    public readonly type: "request" | "response",
    public readonly operation: string,
    public readonly zodError: ZodError,
    public readonly data: unknown,
  ) {
    super(
      `${type === "request" ? "Request" : "Response"} validation failed for operation ${operation}`,
    );
    this.name = "ValidationError";
  }

  toConsoleString(): string {
    const prefix = this.type === "request" ? "🚫 Request" : "⚠️ Response";
    const lines = [
      `${prefix} validation error in operation: ${this.operation}`,
      "",
      "Validation errors:",
    ];

    for (const issue of this.zodError.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      lines.push(`  • ${path}: ${issue.message}`);
    }

    lines.push("");
    lines.push(`Data received: ${JSON.stringify(this.data, null, 2)}`);

    return lines.join("\n");
  }
}

export interface ValidationHelpers {
  validateRequestParams?: (inputs: unknown, operation: Operation) => unknown;
  validateRequestBody?: (body: unknown, operation: Operation) => unknown;
  validateResponseData?: (
    data: unknown,
    operation: Operation,
    status?: string,
  ) => unknown;
}

export function createValidationHelpers(): ValidationHelpers {
  return {
    validateRequestParams: (inputs: unknown, operation: Operation) => {
      if (!inputs) {
        return inputs;
      }

      const validationErrors: ZodError["issues"] = [];
      const typedInputs = inputs as {
        params?: any;
        queries?: any;
        headers?: any;
      };

      // Validate path parameters
      if (
        operation.params &&
        typeof operation.params === "object" &&
        "safeParse" in operation.params
      ) {
        const result = (operation.params as ZodType).safeParse(
          typedInputs.params || {},
        );
        if (!result.success) {
          for (const issue of result.error.issues) {
            validationErrors.push({
              ...issue,
              path: ["params", ...issue.path],
            });
          }
        }
      }

      // Validate query parameters
      if (
        operation.queries &&
        typeof operation.queries === "object" &&
        "safeParse" in operation.queries
      ) {
        const result = (operation.queries as ZodType).safeParse(
          typedInputs.queries || {},
        );
        if (!result.success) {
          for (const issue of result.error.issues) {
            validationErrors.push({
              ...issue,
              path: ["queries", ...issue.path],
            });
          }
        }
      }

      // Validate header parameters
      if (
        operation.headers &&
        typeof operation.headers === "object" &&
        "safeParse" in operation.headers
      ) {
        const result = (operation.headers as ZodType).safeParse(
          typedInputs.headers || {},
        );
        if (!result.success) {
          for (const issue of result.error.issues) {
            validationErrors.push({
              ...issue,
              path: ["headers", ...issue.path],
            });
          }
        }
      }

      if (validationErrors.length > 0) {
        const zodError = { issues: validationErrors } as ZodError;
        throw new ValidationError(
          "request",
          operation.operationId,
          zodError,
          inputs,
        );
      }

      return inputs;
    },

    validateRequestBody: (body: unknown, operation: Operation) => {
      if (
        !body ||
        !("requestBody" in operation) ||
        !operation.requestBody?.schema
      ) {
        return body;
      }

      const schema = operation.requestBody.schema;
      if (typeof schema === "object" && "safeParse" in schema) {
        const result = (schema as ZodType).safeParse(body);
        if (!result.success) {
          throw new ValidationError(
            "request",
            operation.operationId,
            result.error,
            body,
          );
        }
        return result.data;
      }

      return body;
    },

    validateResponseData: (
      data: unknown,
      operation: Operation,
      status = "200",
    ) => {
      const responses = operation.responses as Record<
        string,
        { description?: string; schema?: any }
      >;
      const response = responses[status];
      if (!response?.schema) {
        return data;
      }

      const schema = response.schema;
      if (typeof schema === "object" && "safeParse" in schema) {
        const result = (schema as ZodType).safeParse(data);
        if (!result.success) {
          throw new ValidationError(
            "response",
            operation.operationId,
            result.error,
            data,
          );
        }
        return result.data;
      }

      return data;
    },
  };
}

export interface ValidatedKyClientOptions extends KyClientOptions {
  validate?: boolean;
  disableErrorParsing?: boolean;
}

let kyInstance: typeof ky | undefined;
let validationEnabled = true;
let validationHelpers: ValidationHelpers | undefined;

export function configureClient(options: ValidatedKyClientOptions) {
  const { validate, disableErrorParsing, ...kyOptions } = options;

  // Configure base client
  baseConfigureClient(kyOptions);

  // Reset our extended instance
  kyInstance = undefined;
  validationEnabled = validate !== false;

  if (validationEnabled) {
    validationHelpers = createValidationHelpers();
  }
}

function createValidationHooks() {
  if (!validationHelpers)
    return { beforeRequest: undefined, afterResponse: undefined };

  const beforeRequest: BeforeRequestHook = (request, options) => {
    const operationId = (options as any).operationId as string;
    const operation = operationId
      ? operations[operationId as keyof Operations]
      : undefined;

    if (!operation || !validationHelpers) return request;

    try {
      if ((options as any).inputs && validationHelpers.validateRequestParams) {
        validationHelpers.validateRequestParams(
          (options as any).inputs,
          operation,
        );
      }

      const contentType = request.headers.get("content-type");
      if (
        (options as any).json &&
        contentType?.includes("application/json") &&
        validationHelpers.validateRequestBody
      ) {
        validationHelpers.validateRequestBody((options as any).json, operation);
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        console.error(error.toConsoleString());
        throw error;
      }
      throw error;
    }

    return request;
  };

  const afterResponse: AfterResponseHook = async (
    _request,
    options,
    response,
  ) => {
    const operationId = (options as any).operationId as string;
    const operation = operationId
      ? operations[operationId as keyof Operations]
      : undefined;

    if (!operation || !validationHelpers?.validateResponseData) return response;

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const clonedResponse = response.clone();
      try {
        const data = await clonedResponse.json();
        try {
          validationHelpers.validateResponseData(
            data,
            operation,
            String(response.status),
          );
        } catch (validationError) {
          if (validationError instanceof ValidationError) {
            console.error(validationError.toConsoleString());
            throw validationError;
          }
          // Other validation errors - return response gracefully
          return response;
        }
      } catch (jsonError) {
        // JSON parsing error - return response gracefully without logging
        return response;
      }
    }

    return response;
  };

  return { beforeRequest, afterResponse };
}

export function getValidatedKyInstance(): typeof ky {
  if (!kyInstance) {
    const baseInstance = getKyInstance();

    if (!validationEnabled) {
      kyInstance = baseInstance;
    } else {
      const hooks = createValidationHooks();
      kyInstance = baseInstance.extend({
        hooks: {
          beforeRequest: hooks.beforeRequest
            ? [hooks.beforeRequest]
            : undefined,
          afterResponse: hooks.afterResponse
            ? [hooks.afterResponse]
            : undefined,
        },
      });
    }
  }

  return kyInstance;
}

export function resetValidatedKyInstance() {
  kyInstance = undefined;
}
