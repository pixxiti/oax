import ky, { type Hooks } from "ky";
import type { ZodError, ZodType } from "zod";

export interface ClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  validate?: boolean;
  hooks?: Hooks;
  validationHelpers?: ValidationHelpers;
}

export interface OperationParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: any;
}

export interface OperationRequestBody {
  schema: any;
  required: boolean;
}

export interface OperationResponse {
  description?: string;
  schema?: any;
}

export interface Operation {
  method: string;
  path: string;
  operationId: string;
  summary?: string;
  description?: string;
  params: any;
  queries: any;
  headers: any;
  requestBody?: OperationRequestBody;
  responses: Record<string, OperationResponse>;
}

export type Operations = Record<string, Operation>;

export class ValidationError extends Error {
  constructor(
    public readonly type: "request" | "response",
    public readonly operation: string,
    public readonly zodError: ZodError,
    public readonly data: unknown
  ) {
    super(
      `${type === "request" ? "Request" : "Response"} validation failed for operation ${operation}`
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
  validateResponseData?: (data: unknown, operation: Operation, status?: string) => unknown;
}

export function createValidationHelpers(): ValidationHelpers {
  return {
    validateRequestParams: (inputs: unknown, operation: Operation) => {
      if (!inputs) {
        return inputs;
      }

      const validationErrors: ZodError["issues"] = [];
      const typedInputs = inputs as { params?: any; queries?: any; headers?: any };

      // Validate path parameters
      if (
        operation.params &&
        typeof operation.params === "object" &&
        "safeParse" in operation.params
      ) {
        const result = (operation.params as ZodType).safeParse(typedInputs.params || {});
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
        const result = (operation.queries as ZodType).safeParse(typedInputs.queries || {});
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
        const result = (operation.headers as ZodType).safeParse(typedInputs.headers || {});
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
        throw new ValidationError("request", operation.operationId, zodError, inputs);
      }

      return inputs;
    },

    validateRequestBody: (body: unknown, operation: Operation) => {
      if (!body || !operation.requestBody?.schema) {
        return body;
      }

      const schema = operation.requestBody.schema;
      if (typeof schema === "object" && "safeParse" in schema) {
        const result = (schema as ZodType).safeParse(body);
        if (!result.success) {
          throw new ValidationError("request", operation.operationId, result.error, body);
        }
        return result.data;
      }

      return body;
    },

    validateResponseData: (data: unknown, operation: Operation, status = "200") => {
      const response = operation.responses[status];
      if (!response?.schema) {
        return data;
      }

      const schema = response.schema;
      if (typeof schema === "object" && "safeParse" in schema) {
        const result = (schema as ZodType).safeParse(data);
        if (!result.success) {
          throw new ValidationError("response", operation.operationId, result.error, data);
        }
        return result.data;
      }

      return data;
    },
  };
}

export interface KyValidationHooks {
  beforeRequest: (request: Request, options: any, operation?: Operation) => Request;
  afterResponse: (
    request: Request,
    options: any,
    response: Response,
    operation?: Operation
  ) => Response | Promise<Response>;
}

export function createKyValidationHooks(helpers: ValidationHelpers): KyValidationHooks {
  return {
    beforeRequest: (request, options, operation) => {
      if (!operation || !helpers.validateRequestParams || !helpers.validateRequestBody)
        return request;

      try {
        if ((options as any).inputs) {
          helpers.validateRequestParams((options as any).inputs, operation);
        }

        const contentType = request.headers.get("content-type");
        if ((options as any).json && contentType?.includes("application/json")) {
          helpers.validateRequestBody((options as any).json, operation);
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error(error.toConsoleString());
          throw error;
        }
        throw error;
      }

      return request;
    },

    afterResponse: async (request, options, response, operation) => {
      if (!operation || !helpers.validateResponseData) return response;

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const clonedResponse = response.clone();
        try {
          const data = await clonedResponse.json();
          try {
            helpers.validateResponseData(data, operation, String(response.status));
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
    },
  };
}

// Type helpers for operation inference
type InferPathParams<T extends Operation> = T["params"] extends { _output: infer O } ? O : never;
type InferQueryParams<T extends Operation> = T["queries"] extends { _output: infer O } ? O : never;
type InferHeaderParams<T extends Operation> = T["headers"] extends { _output: infer O } ? O : never;

type InferOperationParams<T extends Operation> = [InferPathParams<T>] extends [never]
  ? [InferQueryParams<T>] extends [never]
    ? [InferHeaderParams<T>] extends [never]
      ? never
      : { headers?: InferHeaderParams<T> }
    : [InferHeaderParams<T>] extends [never]
      ? { queries?: InferQueryParams<T> }
      : { queries?: InferQueryParams<T>; headers?: InferHeaderParams<T> }
  : [InferQueryParams<T>] extends [never]
    ? [InferHeaderParams<T>] extends [never]
      ? { params?: InferPathParams<T> }
      : { params?: InferPathParams<T>; headers?: InferHeaderParams<T> }
    : [InferHeaderParams<T>] extends [never]
      ? { params?: InferPathParams<T>; queries?: InferQueryParams<T> }
      : {
          params?: InferPathParams<T>;
          queries?: InferQueryParams<T>;
          headers?: InferHeaderParams<T>;
        };

type InferOperationBody<T extends Operation> = T["requestBody"] extends OperationRequestBody
  ? T["requestBody"]["required"] extends true
    ? T["requestBody"]["schema"] extends { _output: infer O }
      ? O
      : any
    : T["requestBody"]["schema"] extends { _output: infer O }
      ? O | undefined
      : any | undefined
  : never;

// Helper to find the first 2xx success response
type FindSuccessResponse<T extends Record<string, any>> = {
  [K in keyof T]: K extends `2${string}`
    ? T[K] extends OperationResponse
      ? T[K]["schema"] extends { _output: infer O }
        ? O
        : any
      : any
    : never;
}[keyof T] extends never
  ? // If no 2xx found, try to get any response schema
    {
      [K in keyof T]: T[K] extends OperationResponse
        ? T[K]["schema"] extends { _output: infer O }
          ? O
          : any
        : any;
    }[keyof T] extends never
    ? any
    : {
        [K in keyof T]: T[K] extends OperationResponse
          ? T[K]["schema"] extends { _output: infer O }
            ? O
            : any
          : any;
      }[keyof T]
  : {
      [K in keyof T]: K extends `2${string}`
        ? T[K] extends OperationResponse
          ? T[K]["schema"] extends { _output: infer O }
            ? O
            : any
          : any
        : never;
    }[keyof T];

type InferOperationResponse<T extends Operation> = T["responses"] extends Record<string, any>
  ? FindSuccessResponse<T["responses"]>
  : any;

// Type utilities for accessing types by operation ID
export type BodyById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? InferOperationBody<T[K]>
  : never;

export type InputsById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? InferOperationParams<T[K]>
  : never;

export type QueriesById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? T[K]["queries"] extends { _output: infer O }
    ? O extends Record<string, never>
      ? never
      : O
    : any
  : never;

export type ResponseById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? InferOperationResponse<T[K]>
  : never;

export type ErrorsById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? T[K]["responses"] extends Record<string, any>
    ? {
        [StatusCode in keyof T[K]["responses"]]: StatusCode extends `2${string}`
          ? never
          : T[K]["responses"][StatusCode] extends OperationResponse
            ? T[K]["responses"][StatusCode]["schema"] extends { _output: infer O }
              ? O
              : any
            : any;
      } extends Record<string, never>
      ? never
      : {
          [StatusCode in keyof T[K]["responses"]]: StatusCode extends `2${string}`
            ? never
            : T[K]["responses"][StatusCode] extends OperationResponse
              ? T[K]["responses"][StatusCode]["schema"] extends { _output: infer O }
                ? O
                : any
              : any;
        }
    : never
  : never;

export type ParamsById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? T[K]["params"] extends { _output: infer O }
    ? O extends Record<string, never>
      ? never
      : O
    : never
  : never;

export type HeadersById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? T[K]["headers"] extends { _output: infer O }
    ? O
    : any
  : never;

// Create typed client interface based on operations
type TypedClient<T extends Operations> = {
  [K in keyof T]: T[K] extends Operation
    ? T[K]["requestBody"] extends OperationRequestBody
      ? (
          inputs: InferOperationParams<T[K]>,
          body: InferOperationBody<T[K]>
        ) => Promise<InferOperationResponse<T[K]>>
      : InferOperationParams<T[K]> extends never
        ? () => Promise<InferOperationResponse<T[K]>>
        : (inputs: InferOperationParams<T[K]>) => Promise<InferOperationResponse<T[K]>>
    : never;
} & {
  ky: typeof ky;
  request: (
    operationId: string,
    inputs?: { params?: any; queries?: any; headers?: any },
    body?: any
  ) => Promise<any>;
};

export class ApiClient {
  public readonly ky: typeof ky;
  private operations: Operations;
  private validationHelpers?: ValidationHelpers;

  constructor(baseUrl: string, operations: Operations, options?: Omit<ClientOptions, "baseUrl">) {
    this.operations = operations;

    const shouldValidate = options?.validate !== false;

    if (!shouldValidate) {
      this.ky = ky.create({
        prefixUrl: baseUrl,
        ...options,
      });
      return;
    }

    this.validationHelpers = options?.validationHelpers ?? createValidationHelpers();
    const hooks = createKyValidationHooks(this.validationHelpers);

    this.ky = ky.create({
      prefixUrl: baseUrl,
      ...(options?.headers && { headers: options.headers }),
      hooks: {
        beforeRequest: [
          (request, options) => {
            const operation = (options as any).operation as Operation;
            return hooks.beforeRequest?.(request, options, operation) ?? request;
          },
          ...(options?.hooks?.beforeRequest ?? []),
        ],
        afterResponse: [
          (request, options, response) => {
            const operation = (options as any).operation as Operation;
            return hooks.afterResponse?.(request, options, response, operation) ?? response;
          },
          ...(options?.hooks?.afterResponse ?? []),
        ],
      },
    });
  }

  async request(
    operationId: string,
    inputs?: {
      params?: any;
      queries?: any;
      headers?: any;
    },
    body?: any
  ): Promise<any> {
    const operation = this.operations[operationId];
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    // Remove leading slash for ky prefixUrl compatibility
    let url = operation.path.startsWith("/") ? operation.path.slice(1) : operation.path;
    const searchParams = new URLSearchParams();
    const headers: Record<string, string> = {};

    // Handle path parameters
    if (inputs?.params) {
      for (const [paramName, value] of Object.entries(inputs.params)) {
        if (value === undefined || value === null) {
          throw new Error(`Required path parameter ${paramName} is missing`);
        }
        url = url.replace(`{${paramName}}`, encodeURIComponent(String(value)));
      }
    }

    // Handle query parameters
    if (inputs?.queries) {
      for (const [queryName, value] of Object.entries(inputs.queries)) {
        if (value !== undefined && value !== null) {
          searchParams.set(queryName, String(value));
        }
      }
    }

    // Handle header parameters
    if (inputs?.headers) {
      for (const [headerName, value] of Object.entries(inputs.headers)) {
        if (value !== undefined && value !== null) {
          headers[headerName] = String(value);
        }
      }
    }

    const requestOptions: any = {
      method: operation.method.toUpperCase(),
      headers,
      searchParams,
      operation, // Pass operation to hooks
      inputs, // Pass params for validation
    };

    if (body && operation.requestBody) {
      requestOptions.json = body;
      // Set content-type header for JSON requests
      headers["content-type"] = "application/json";
    }

    const response = await this.ky(url, requestOptions);

    // Handle response based on content type
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return response.json();
    }
    if (response.status === 204 || !operation.responses["200"]?.schema) {
      return;
    }
    return response.text();
  }

  // Dynamic method creation - operations will be bound at runtime
  [key: string]: any;
}

// Helper to create typed client with operation methods
export function createClient<T extends Operations>(
  baseUrl: string,
  operations: T,
  options?: Omit<ClientOptions, "baseUrl">
): TypedClient<T> {
  if (operations.ky || operations.request) {
    throw new Error(
      "`ky` and `request` are reserved properties and cannot be used as operation IDs"
    );
  }

  const client = new ApiClient(baseUrl, operations, options);

  // Add typed methods for each operation
  for (const [operationId] of Object.entries(operations)) {
    (client as any)[operationId] = (
      inputs?: {
        params?: any;
        queries?: any;
        headers?: any;
      },
      body?: any
    ) => {
      return client.request(operationId, inputs, body);
    };
  }

  return client as TypedClient<T>;
}
