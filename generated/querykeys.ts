// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T04:37:23.117Z

export function listPetsQueryKey(): readonly ["listPets"];

export function listPetsQueryKey(
  params?: undefined,
  queries?: { limit?: any },
): readonly ["listPets", undefined, { limit?: any }];

export function listPetsQueryKey(
  params?: undefined,
  queries?: { limit?: any },
) {
  if (queries !== undefined) {
    return ["listPets", undefined, queries] as const;
  }
  return ["listPets"] as const;
}

export function createPetQueryKey(): readonly ["createPet"];

export function createPetQueryKey() {
  return ["createPet"] as const;
}

export function getPetByIdQueryKey(params: {
  petId: any;
}): readonly ["getPetById", { petId: any }];

export function getPetByIdQueryKey(params: { petId: any }) {
  return ["getPetById", params] as const;
}

export type OperationId = "listPets" | "createPet" | "getPetById";

/**
 * Get all query keys for a specific operation
 */
export function getOperationQueryKeys(
  operationId: OperationId,
): readonly [OperationId, ...any[]] {
  return [operationId] as const;
}

/**
 * Query key utilities for React Query integration
 */
export const queryKeys = {
  /**
   * Get all keys that match the operation ID (useful for invalidation)
   */
  operation: (operationId: OperationId) => [operationId] as const,

  /**
   * Get keys with operation ID and params (useful for partial invalidation)
   */
  operationWithParams: (operationId: OperationId, params: any) =>
    [operationId, params] as const,

  /**
   * Get exact keys with operation ID, params, and queries (for exact matching)
   */
  exact: (operationId: OperationId, params?: any, queries?: any) => {
    if (queries !== undefined) {
      return [operationId, params, queries] as const;
    }
    if (params !== undefined) {
      return [operationId, params] as const;
    }
    return [operationId] as const;
  },

  /**
   * All operation query key factories
   */
  listPets: listPetsQueryKey,
  createPet: createPetQueryKey,
  getPetById: getPetByIdQueryKey,
} as const;

/**
 * Type-safe query key factory
 */
export type QueryKeyFactory<T extends OperationId> = (typeof queryKeys)[T];

/**
 * Infer query key type from operation ID
 */
export type QueryKey<T extends OperationId> = ReturnType<QueryKeyFactory<T>>;
