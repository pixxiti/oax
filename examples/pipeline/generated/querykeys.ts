// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T16:32:03.376Z

import type { z } from "zod";
import type { Operations } from "./schemas";

export function listPetsQueryKey<
  TParams extends Partial<z.infer<Operations["listPets"]["params"]>> = Record<
    string,
    never
  >,
  TQueries extends Partial<z.infer<Operations["listPets"]["queries"]>> = Record<
    string,
    never
  >,
>(
  params?: TParams,
  queries?: TQueries,
): readonly ["listPets", TParams?, TQueries?] {
  const key: readonly ["listPets", TParams?, TQueries?] = ["listPets"];
  if (params !== undefined) {
    (key as any).push(params);
    if (queries !== undefined) {
      (key as any).push(queries);
    }
  } else if (queries !== undefined) {
    (key as any).push(undefined, queries);
  }
  return key;
}

export function createPetQueryKey<
  TParams extends Partial<z.infer<Operations["createPet"]["params"]>> = Record<
    string,
    never
  >,
  TQueries extends Partial<
    z.infer<Operations["createPet"]["queries"]>
  > = Record<string, never>,
>(
  params?: TParams,
  queries?: TQueries,
): readonly ["createPet", TParams?, TQueries?] {
  const key: readonly ["createPet", TParams?, TQueries?] = ["createPet"];
  if (params !== undefined) {
    (key as any).push(params);
    if (queries !== undefined) {
      (key as any).push(queries);
    }
  } else if (queries !== undefined) {
    (key as any).push(undefined, queries);
  }
  return key;
}

export function getPetByIdQueryKey<
  TParams extends Partial<z.infer<Operations["getPetById"]["params"]>> = Record<
    string,
    never
  >,
  TQueries extends Partial<
    z.infer<Operations["getPetById"]["queries"]>
  > = Record<string, never>,
>(
  params?: TParams,
  queries?: TQueries,
): readonly ["getPetById", TParams?, TQueries?] {
  const key: readonly ["getPetById", TParams?, TQueries?] = ["getPetById"];
  if (params !== undefined) {
    (key as any).push(params);
    if (queries !== undefined) {
      (key as any).push(queries);
    }
  } else if (queries !== undefined) {
    (key as any).push(undefined, queries);
  }
  return key;
}

export type OperationId = "listPets" | "createPet" | "getPetById";

/**
 * Get all keys that match the operation ID (useful for invalidation)
 */
export function createOperationKey(operationId: OperationId) {
  return [operationId] as const;
}

/**
 * Get keys with operation ID and params (useful for partial invalidation)
 */
export function createOperationWithParamsKey<T extends OperationId>(
  operationId: T,
  params: Partial<z.infer<Operations[T]["params"]>>,
) {
  return [operationId, params] as const;
}

/**
 * Get exact keys with operation ID, params, and queries (for exact matching)
 */
export function createExactKey<T extends OperationId>(
  operationId: T,
  params?: Partial<z.infer<Operations[T]["params"]>>,
  queries?: Partial<z.infer<Operations[T]["queries"]>>,
) {
  if (queries !== undefined) {
    return [operationId, params, queries] as const;
  }
  if (params !== undefined) {
    return [operationId, params] as const;
  }
  return [operationId] as const;
}

/**
 * Type-safe query key factory
 */
export type QueryKeyFactory<T extends OperationId> = T extends "listPets"
  ? typeof listPetsQueryKey
  : T extends "createPet"
    ? typeof createPetQueryKey
    : T extends "getPetById"
      ? typeof getPetByIdQueryKey
      : never;

/**
 * Infer query key type from operation ID
 */
export type QueryKey<T extends OperationId> = ReturnType<QueryKeyFactory<T>>;
