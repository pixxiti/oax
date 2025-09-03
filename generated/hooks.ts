// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T04:37:23.121Z

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";
import { listPets, createPet, getPetById } from "./client.js";
import { queryKeys } from "./querykeys.js";

export function useListPets(
  params?: any,
  queries?: any,
  options?: Omit<UseQueryOptions<any>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.listPets(params, queries),
    queryFn: () => listPets(params),
    ...options,
  });
}

export function useCreatePet(options?: UseMutationOptions<any, Error, any>) {
  return useMutation({
    mutationFn: (data: any) => createPet(data),
    ...options,
  });
}

export function useGetPetById(
  params: any,
  options?: Omit<UseQueryOptions<any>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.getPetById(params),
    queryFn: () => getPetById(params),
    ...options,
  });
}
