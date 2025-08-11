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
  PathParamsById,
  QueriesById,
  ResponseById,
} from "@zoddy/core";

export interface HooksOptions {
  apiName: string;
  client: any;
}

// New structured parameter format: { params, queries, headers }
type QueryParams<T extends Operations, K extends keyof T> = {
  params?: PathParamsById<T, K> extends never ? undefined : PathParamsById<T, K>;
  queries?: QueriesById<T, K> extends never ? undefined : QueriesById<T, K>;
  headers?: HeadersById<T, K> extends never ? undefined : HeadersById<T, K>;
} extends { params?: undefined; queries?: undefined; headers?: undefined }
  ? undefined
  : {
      params?: PathParamsById<T, K> extends never ? undefined : PathParamsById<T, K>;
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

// Simpler approach - use the helper type
export type TypedHooks<T extends Operations> = {
  [K in keyof T]: IsGetMethod<T[K]> extends true
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

export function createHooks<const T extends Operations>(
  options: HooksOptions & { operations: T }
): TypedHooks<T> & { getKey: GetKeyFunction<T> } {
  const { apiName, client, operations } = options;
  const hooks: any = {};

  for (const [operationId, operation] of Object.entries(operations)) {
    if (!operation || typeof operation !== "object" || !("method" in operation)) continue;

    const typedOperation = operation as Operation;
    if (typedOperation.method === "get") {
      hooks[operationId] = (params?: any, queryOptions?: any) => {
        const queryKey = generateQueryKey(apiName, operationId, operation, params);

        return useQuery({
          queryKey,
          queryFn: async () => {
            // Convert structured params to flattened format for client
            if (!params) {
              return client[operationId]();
            }

            const flattenedParams: any = {};

            // Merge all parameter types into a single object
            if (params.params) {
              Object.assign(flattenedParams, params.params);
            }
            if (params.queries) {
              Object.assign(flattenedParams, params.queries);
            }
            if (params.headers) {
              Object.assign(flattenedParams, params.headers);
            }

            return Object.keys(flattenedParams).length > 0
              ? client[operationId](flattenedParams)
              : client[operationId]();
          },
          ...queryOptions,
        });
      };
    } else {
      hooks[operationId] = (mutationOptions?: any) => {
        return useMutation({
          mutationFn: async (variables: MutationParams<T, any>) => {
            if (!variables) {
              return client[operationId]();
            }

            const hasParams = typedOperation.parameters && typedOperation.parameters.length > 0;
            const hasBody = typedOperation.requestBody;

            // Extract flattened parameters from structured format
            const flattenedParams: any = {};
            let body: any = undefined;

            // Check if variables has the new structured format
            if (variables && typeof variables === "object") {
              // Extract parameters from structured format
              if ("params" in variables && variables.params) {
                Object.assign(flattenedParams, variables.params);
              }
              if ("queries" in variables && variables.queries) {
                Object.assign(flattenedParams, variables.queries);
              }
              if ("headers" in variables && variables.headers) {
                Object.assign(flattenedParams, variables.headers);
              }

              // Extract body data (everything that's not params/queries/headers)
              const bodyData: any = {};
              for (const [key, value] of Object.entries(variables)) {
                if (key !== "params" && key !== "queries" && key !== "headers") {
                  bodyData[key] = value;
                }
              }
              if (Object.keys(bodyData).length > 0) {
                body = bodyData;
              }
            }

            if (hasParams && hasBody) {
              return client[operationId](
                Object.keys(flattenedParams).length > 0 ? flattenedParams : undefined,
                body
              );
            }

            if (hasParams) {
              return client[operationId](
                Object.keys(flattenedParams).length > 0 ? flattenedParams : undefined
              );
            }

            if (hasBody) {
              return client[operationId](undefined, body || variables);
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
