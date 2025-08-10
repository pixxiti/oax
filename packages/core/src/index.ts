import ky from "ky";

export interface ClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
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
  parameters: OperationParameter[];
  requestBody?: OperationRequestBody;
  responses: Record<string, OperationResponse>;
}

export type Operations = Record<string, Operation>;

// Type helpers for operation inference
type InferOperationParams<T extends Operation> =
  T["parameters"] extends readonly OperationParameter[]
    ? T["parameters"] extends readonly []
      ? {}
      : {
          [P in T["parameters"][number] as P["name"]]: P["required"] extends true
            ? P["schema"] extends { _output: infer O }
              ? O
              : any
            : P["schema"] extends { _output: infer O }
              ? O | undefined
              : any | undefined;
        }
    : {};

type InferOperationBody<T extends Operation> = T["requestBody"] extends OperationRequestBody
  ? T["requestBody"]["required"] extends true
    ? T["requestBody"]["schema"] extends { _output: infer O }
      ? O
      : any
    : T["requestBody"]["schema"] extends { _output: infer O }
      ? O | undefined
      : any | undefined
  : never;

type InferOperationResponse<T extends Operation> = T["responses"] extends Record<string, any>
  ? T["responses"]["200"] extends OperationResponse
    ? T["responses"]["200"]["schema"] extends { _output: infer O }
      ? O
      : any
    : any
  : any;

// Create typed client interface based on operations
type TypedClient<T extends Operations> = ApiClient & {
  [K in keyof T]: T[K] extends Operation
    ? T[K]["requestBody"] extends OperationRequestBody
      ? (
          params: InferOperationParams<T[K]>,
          body: InferOperationBody<T[K]>
        ) => Promise<InferOperationResponse<T[K]>>
      : T[K]["parameters"] extends readonly OperationParameter[]
        ? T[K]["parameters"] extends readonly []
          ? () => Promise<InferOperationResponse<T[K]>>
          : (params: InferOperationParams<T[K]>) => Promise<InferOperationResponse<T[K]>>
        : () => Promise<InferOperationResponse<T[K]>>
    : never;
};

export class ApiClient {
  private ky: typeof ky;
  private operations: Operations;

  constructor(baseUrl: string, operations: Operations, options?: Omit<ClientOptions, "baseUrl">) {
    this.operations = operations;
    this.ky = ky.create({
      prefixUrl: baseUrl,
      ...(options?.headers && { headers: options.headers }),
    });
  }

  async request(operationId: string, params?: any, body?: any): Promise<any> {
    const operation = this.operations[operationId];
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    let url = operation.path;
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
    };

    if (body && operation.requestBody) {
      requestOptions.json = body;
    }

    const response = await this.ky(url, requestOptions);

    // Handle response based on content type
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return response.json();
    } else if (response.status === 204 || !operation.responses["200"]?.schema) {
      return;
    } else {
      return response.text();
    }
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
  const client = new ApiClient(baseUrl, operations, options);

  // Add typed methods for each operation
  for (const [operationId] of Object.entries(operations)) {
    (client as any)[operationId] = (params?: any, body?: any) =>
      client.request(operationId, params, body);
  }

  // remove request from return
  delete (client as any).request;

  return client as TypedClient<T>;
}
