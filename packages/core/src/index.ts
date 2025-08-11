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
  parameters: readonly OperationParameter[];
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
  validateRequestParams?: (params: unknown, operation: Operation) => unknown;
  validateRequestBody?: (body: unknown, operation: Operation) => unknown;
  validateResponseData?: (data: unknown, operation: Operation, status?: string) => unknown;
}

export function createValidationHelpers(): ValidationHelpers {
  return {
    validateRequestParams: (params: unknown, operation: Operation) => {
      if (!params || !operation.parameters || operation.parameters.length === 0) {
        return params;
      }

      const validationErrors: ZodError["issues"] = [];

      for (const param of operation.parameters) {
        if (param.schema && typeof param.schema === "object" && "safeParse" in param.schema) {
          const value = (params as any)?.[param.name];

          // Only validate if parameter is required OR if it's optional but provided
          if (param.required || value !== undefined) {
            const result = (param.schema as ZodType).safeParse(value);

            if (!result.success) {
              for (const issue of result.error.issues) {
                validationErrors.push({
                  ...issue,
                  path: [param.name, ...issue.path],
                });
              }
            }
          }
        }
      }

      if (validationErrors.length > 0) {
        const zodError = { issues: validationErrors } as ZodError;
        throw new ValidationError("request", operation.operationId, zodError, params);
      }

      return params;
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
        if ((options as any).params) {
          helpers.validateRequestParams((options as any).params, operation);
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
type InferOperationParams<T extends Operation> =
  T["parameters"] extends readonly OperationParameter[]
    ? T["parameters"] extends readonly []
      ? never
      : {
          [P in T["parameters"][number] as P["name"]]: P["required"] extends true
            ? P["schema"] extends { _output: infer O }
              ? O
              : any
            : P["schema"] extends { _output: infer O }
              ? O | undefined
              : any | undefined;
        }
    : never;

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

export type ParamsById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? InferOperationParams<T[K]>
  : never;

export type QueriesById<T extends Operations, K extends keyof T> = T[K] extends Operation
  ? T[K]["parameters"] extends readonly OperationParameter[]
    ? T[K]["parameters"] extends readonly []
      ? never
      : {
            [P in T[K]["parameters"][number] as P["in"] extends "query"
              ? P["name"]
              : never]: P["required"] extends true
              ? P["schema"] extends { _output: infer O }
                ? O
                : any
              : P["schema"] extends { _output: infer O }
                ? O | undefined
                : any | undefined;
          } extends Record<string, never>
        ? never
        : {
            [P in T[K]["parameters"][number] as P["in"] extends "query"
              ? P["name"]
              : never]: P["required"] extends true
              ? P["schema"] extends { _output: infer O }
                ? O
                : any
              : P["schema"] extends { _output: infer O }
                ? O | undefined
                : any | undefined;
          }
    : never
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

// Create typed client interface based on operations
type TypedClient<T extends Operations> = {
  [K in keyof T]: T[K] extends Operation
    ? T[K]["requestBody"] extends OperationRequestBody
      ? InferOperationParams<T[K]> extends never
        ? (body: InferOperationBody<T[K]>) => Promise<InferOperationResponse<T[K]>>
        : (
            params: InferOperationParams<T[K]>,
            body: InferOperationBody<T[K]>
          ) => Promise<InferOperationResponse<T[K]>>
      : T[K]["parameters"] extends readonly OperationParameter[]
        ? T[K]["parameters"] extends readonly []
          ? () => Promise<InferOperationResponse<T[K]>>
          : (params: InferOperationParams<T[K]>) => Promise<InferOperationResponse<T[K]>>
        : () => Promise<InferOperationResponse<T[K]>>
    : never;
} & {
  ky: typeof ky;
  request: (operationId: string, params?: any, body?: any) => Promise<any>;
};

export class ApiClient {
  public readonly ky: typeof ky;
  private operations: Operations;
  private validationHelpers?: ValidationHelpers;

  constructor(baseUrl: string, operations: Operations, options?: Omit<ClientOptions, "baseUrl">) {
    this.operations = operations;
    this.headers = options?.headers ?? {};

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

  async request(operationId: string, params?: any, body?: any): Promise<any> {
    const operation = this.operations[operationId];
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    // Remove leading slash for ky prefixUrl compatibility
    let url = operation.path.startsWith("/") ? operation.path.slice(1) : operation.path;
    const searchParams = new URLSearchParams();
    const headers: Record<string, string> = {};

    // Handle parameters
    if (params && operation.parameters) {
      for (const param of operation.parameters) {
        const value = params[param.name];
        if (value !== undefined) {
          if (param.in === "path") {
            url = url.replace(`{${param.name}}`, encodeURIComponent(String(value)));
          } else if (param.in === "query") {
            searchParams.set(param.name, String(value));
          } else if (param.in === "header") {
            headers[param.name] = String(value);
          }
        } else if (param.required) {
          throw new Error(`Required parameter ${param.name} is missing`);
        }
      }
    }

    const requestOptions: any = {
      method: operation.method.toUpperCase(),
      headers,
      searchParams,
      operation, // Pass operation to hooks
      params, // Pass params for validation
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
    throw new Error("`ky` and `request` are reserved properties and cannot be used as operation IDs");
  }

  const client = new ApiClient(baseUrl, operations, options);

  // Add typed methods for each operation
  for (const [operationId, operation] of Object.entries(operations)) {
    (client as any)[operationId] = (paramsOrBody?: any, body?: any) => {
      // If operation has requestBody but no parameters, treat first arg as body
      if (operation.requestBody && (!operation.parameters || operation.parameters.length === 0)) {
        return client.request(operationId, undefined, paramsOrBody);
      }
      // Otherwise, treat args as (params, body)
      return client.request(operationId, paramsOrBody, body);
    };
  }

  return client as TypedClient<T>;
}
