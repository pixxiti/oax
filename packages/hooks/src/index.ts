import {
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type {
  BodyById,
  HeadersById,
  Operation,
  Operations,
  ParamsById,
  QueriesById,
  ResponseById,
} from "@zoddy/core";

export interface HooksOptions {
  apiName: string;
  client: any;
}

export interface HooksOptionsWithOperations<T extends Operations> {
  apiName: string;
  client: any;
  operations: T;
}

export interface HooksOptionsInferred {
  apiName: string;
  client: { operations: Operations } & any;
}

// New structured parameter format: { params, queries, headers }
type QueryParams<T extends Operations, K extends keyof T> = {
  params?: ParamsById<T, K> extends never ? undefined : ParamsById<T, K>;
  queries?: QueriesById<T, K> extends never ? undefined : QueriesById<T, K>;
  headers?: HeadersById<T, K> extends never ? undefined : HeadersById<T, K>;
} extends { params?: undefined; queries?: undefined; headers?: undefined }
  ? undefined
  : {
      params?: ParamsById<T, K> extends never ? undefined : ParamsById<T, K>;
      queries?: QueriesById<T, K> extends never ? undefined : QueriesById<T, K>;
      headers?: HeadersById<T, K> extends never ? undefined : HeadersById<T, K>;
    };

type MutationParams<T extends Operations, K extends keyof T> = BodyById<T, K> extends never
  ? QueryParams<T, K>
  : QueryParams<T, K> extends undefined
    ? BodyById<T, K>
    : QueryParams<T, K> & BodyById<T, K>;

// Define separate interfaces for query and mutation hooks
interface QueryHookInterface<TData, TParams> {
  (params?: TParams): ReturnType<typeof useQuery<TData>>;
  (
    params: TParams,
    queryOptions: Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">
  ): ReturnType<typeof useQuery<TData>>;
  (
    queryOptions: Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">
  ): ReturnType<typeof useQuery<TData>>;
  (
    params?: TParams,
    queryOptions?: Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">
  ): ReturnType<typeof useQuery<TData>>;
}

interface MutationHookInterface<TData, TVariables> {
  (): ReturnType<typeof useMutation<TData, Error, TVariables>>;
  (
    mutationOptions: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">
  ): ReturnType<typeof useMutation<TData, Error, TVariables>>;
}

// Helper type to detect GET operations more reliably
export type IsGetMethod<T> = T extends { method: infer M }
  ? M extends "get"
    ? true
    : M extends string
      ? M extends "get"
        ? true
        : false
      : false
  : false;

// Helper to convert operation ID to camelCase hook name with "use" prefix
type ToCamelCaseHookName<T extends string> = T extends `${infer First}${infer Rest}`
  ? `use${Uppercase<First>}${Rest}`
  : never;

// Type for hooks with camelCase naming
export type TypedHooks<T extends Operations> = {
  [K in keyof T as ToCamelCaseHookName<string & K>]: IsGetMethod<T[K]> extends true
    ? QueryHookInterface<ResponseById<T, K>, QueryParams<T, K>>
    : MutationHookInterface<ResponseById<T, K>, MutationParams<T, K>>;
};

function normalizePathWithParams(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

export function generateQueryKey<T extends Operations, K extends keyof T>(
  apiName: string,
  operationId: K,
  operation: T[K],
  params?: QueryParams<T, K>
): QueryKey {
  if (!operation || typeof operation !== "object" || !("path" in operation)) {
    return [{ apiName, operationId }];
  }

  const normalizedPath = normalizePathWithParams(operation.path);
  const baseKey = [{ apiName, path: normalizedPath }];

  if (!params) {
    return baseKey;
  }

  // Build query key based on new structured format
  const keyParts: any[] = [...baseKey];

  // Add path parameters if present
  if (params && typeof params === "object" && "params" in params && params.params) {
    keyParts.push(params.params);
  }

  // Add query parameters if present
  if (params && typeof params === "object" && "queries" in params && params.queries) {
    keyParts.push(params.queries);
  }

  return keyParts;
}

// Helper function to convert operation ID to camelCase hook name
function toCamelCaseHookName(operationId: string): string {
  return `use${operationId.charAt(0).toUpperCase()}${operationId.slice(1)}`;
}

// Overloaded function signatures
export function createHooks<const T extends Operations>(
  options: HooksOptionsWithOperations<T>
): TypedHooks<T> & { getKey: GetKeyFunction<T> };
export function createHooks<const T extends Operations>(
  options: HooksOptionsInferred & { client: { operations: T } }
): TypedHooks<T> & { getKey: GetKeyFunction<T> };
export function createHooks<const T extends Operations>(
  options: (HooksOptionsWithOperations<T> | HooksOptionsInferred) & { client: { operations?: T } }
): TypedHooks<T> & { getKey: GetKeyFunction<T> } {
  const { apiName, client } = options;
  const operations = "operations" in options ? options.operations : client.operations;

  if (!operations) {
    throw new Error("Operations must be provided either explicitly or via client.operations");
  }

  const hooks: any = {};

  for (const [operationId, operation] of Object.entries(operations)) {
    if (!operation || typeof operation !== "object" || !("method" in operation)) continue;

    const hookName = toCamelCaseHookName(operationId);
    const typedOperation = operation as Operation;

    if (typedOperation.method === "get") {
      hooks[hookName] = (params?: any, queryOptions?: any) => {
        const queryKey = generateQueryKey(apiName, operationId, typedOperation, params);

        return useQuery({
          queryKey,
          queryFn: async () => {
            // Use the new structured parameter format directly
            return client[operationId](params);
          },
          ...queryOptions,
        });
      };
    } else {
      hooks[hookName] = (mutationOptions?: any) => {
        return useMutation({
          mutationFn: async (variables: MutationParams<T, any>) => {
            if (!variables) {
              return client[operationId]();
            }

            const hasParams =
              typedOperation.params || typedOperation.queries || typedOperation.headers;
            const hasBody = typedOperation.requestBody;

            // Check if variables has the new structured format (params, queries, headers)
            if (
              variables &&
              typeof variables === "object" &&
              ("params" in variables || "queries" in variables || "headers" in variables)
            ) {
              // Extract structured parameters
              const inputs = {
                params: "params" in variables ? variables.params : undefined,
                queries: "queries" in variables ? variables.queries : undefined,
                headers: "headers" in variables ? variables.headers : undefined,
              };

              // Extract body data (everything that's not params/queries/headers)
              const bodyData: any = {};
              for (const [key, value] of Object.entries(variables)) {
                if (key !== "params" && key !== "queries" && key !== "headers") {
                  bodyData[key] = value;
                }
              }
              const body = Object.keys(bodyData).length > 0 ? bodyData : undefined;

              // Call with structured format
              if (hasParams && hasBody) {
                return client[operationId](inputs, body);
              }
              if (hasParams) {
                return client[operationId](inputs);
              }
              if (hasBody) {
                return client[operationId](undefined, body);
              }
              return client[operationId]();
            }

            // Fallback for non-structured variables (treat as body)
            if (hasBody) {
              return client[operationId](undefined, variables);
            }

            return client[operationId]();
          },
          ...mutationOptions,
        });
      };
    }
  }

  hooks.getKey = createGetKeyFunction(apiName, operations);

  return hooks;
}

type GetKeyFunction<T extends Operations> = <K extends keyof T>(
  operationId: K,
  params?: QueryParams<T, K>
) => QueryKey;

function createGetKeyFunction<T extends Operations>(
  apiName: string,
  operations: T
): GetKeyFunction<T> {
  return <K extends keyof T>(operationId: K, params?: any): QueryKey => {
    const operation = operations[operationId];
    return generateQueryKey(apiName, operationId, operation, params);
  };
}

export type { QueryParams, MutationParams, GetKeyFunction };
