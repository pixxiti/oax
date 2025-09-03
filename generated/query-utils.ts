// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T04:37:23.125Z

import { useQueryClient } from "@tanstack/react-query";
import { createOperationKey, createOperationWithParamsKey, createExactKey, type OperationId } from "./querykeys.js";

/**
 * React hook that provides utilities for query invalidation and cache management
 */
export function useQueryUtils() {
  const queryClient = useQueryClient();

  return {
    /**
     * Invalidate all queries for a specific operation
     * Example: invalidateOperation('listPets') - invalidates all listPets queries
     */
    invalidateOperation: (operationId: OperationId) => {
      return queryClient.invalidateQueries({
        queryKey: createOperationKey(operationId),
      });
    },

    /**
     * Invalidate queries for a specific operation with specific params
     * Example: invalidateOperationWithParams('getPetById', { petId: '123' })
     */
    invalidateOperationWithParams: (operationId: OperationId, params: any) => {
      return queryClient.invalidateQueries({
        queryKey: createOperationWithParamsKey(operationId, params),
      });
    },

    /**
     * Invalidate an exact query key
     * Example: invalidateExact('listPets', undefined, { limit: 10 })
     */
    invalidateExact: (operationId: OperationId, params?: any, queries?: any) => {
      return queryClient.invalidateQueries({
        queryKey: createExactKey(operationId, params, queries),
      });
    },

    /**
     * Remove all queries for a specific operation from cache
     */
    removeOperation: (operationId: OperationId) => {
      return queryClient.removeQueries({
        queryKey: createOperationKey(operationId),
      });
    },

    /**
     * Remove queries for a specific operation with specific params from cache
     */
    removeOperationWithParams: (operationId: OperationId, params: any) => {
      return queryClient.removeQueries({
        queryKey: createOperationWithParamsKey(operationId, params),
      });
    },

    /**
     * Remove an exact query from cache
     */
    removeExact: (operationId: OperationId, params?: any, queries?: any) => {
      return queryClient.removeQueries({
        queryKey: createExactKey(operationId, params, queries),
      });
    },

    /**
     * Get cached data for a specific query
     */
    getCachedData: (operationId: OperationId, params?: any, queries?: any) => {
      return queryClient.getQueryData(createExactKey(operationId, params, queries));
    },

    /**
     * Set cached data for a specific query
     */
    setCachedData: (operationId: OperationId, data: any, params?: any, queries?: any) => {
      return queryClient.setQueryData(createExactKey(operationId, params, queries), data);
    },
  };
}

/**
 * Utility functions for working with query keys outside of React components (tree-shakeable)
 */
export {
  createOperationKey as getOperationKey,
  createOperationWithParamsKey as getOperationWithParamsKey,
  createExactKey as getExactKey
};