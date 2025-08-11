import {
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type { BodyById, Operation, Operations, ParamsById, ResponseById } from "@zoddy/core";

export interface HooksOptions {
  apiName: string;
  client: any;
}

// Use ParamsById directly - it already includes all parameters flattened
type QueryParams<T extends Operations, K extends keyof T> = ParamsById<T, K> extends never
  ? undefined
  : ParamsById<T, K>;

type MutationParams<T extends Operations, K extends keyof T> = ParamsById<T, K> extends never
  ? BodyById<T, K> extends never
    ? undefined
    : BodyById<T, K>
  : BodyById<T, K> extends never
    ? ParamsById<T, K>
    : ParamsById<T, K> & BodyById<T, K>;

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

function generateQueryKey<T extends Operations, K extends keyof T>(
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

  // params is now a flattened object with all parameters
  return [...baseKey, params];
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
            // params is already flattened, pass directly to client
            return client[operationId](params);
          },
          ...queryOptions,
        });
      };
    } else {
      hooks[operationId] = (mutationOptions?: any) => {
        return useMutation({
          mutationFn: async (variables: MutationParams<T, any>) => {
            // For mutations, we need to separate params from body
            // The client expects (params, body) but our MutationParams now flattens them
            const hasParams = typedOperation.parameters && typedOperation.parameters.length > 0;
            const hasBody = typedOperation.requestBody;

            if (hasParams && hasBody) {
              // Both params and body - need to separate them
              const params: any = {};
              const body: any = {};

              for (const param of typedOperation.parameters) {
                if (variables && typeof variables === "object" && param.name in variables) {
                  params[param.name] = (variables as any)[param.name];
                }
              }

              // Everything else goes to body
              if (variables && typeof variables === "object") {
                for (const [key, value] of Object.entries(variables)) {
                  if (!typedOperation.parameters.some((p) => p.name === key)) {
                    body[key] = value;
                  }
                }
              }

              return client[operationId](params, body);
            }

            if (hasParams) {
              // Only params
              return client[operationId](variables);
            }

            // Only body
            return client[operationId](undefined, variables);
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
    if (!operation) {
      return [{ apiName, operationId }];
    }

    const normalizedPath = normalizePathWithParams(operation.path);
    const baseKey = [{ apiName, path: normalizedPath }];

    if (!params) {
      return baseKey;
    }

    // params is now a flattened object with all parameters
    return [...baseKey, params];
  };
}

export type { QueryParams, MutationParams, GetKeyFunction };
