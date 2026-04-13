// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2026-04-13T21:48:53.588Z

import { useQuery, useMutation } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";
import type { HTTPError } from "ky";
import { listPets, createPet, getPetById } from "./client.js";
import { listPetsQueryKey, getPetByIdQueryKey } from "./querykeys.js";

export function useListPets(
  params?: undefined,
  queries?: any,
  options?: Omit<UseQueryOptions<unknown, HTTPError>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: listPetsQueryKey(params, queries),
    queryFn: () => listPets(params),
    ...options,
  });
}

export function useCreatePet(
  options?: UseMutationOptions<unknown, HTTPError, any>,
) {
  return useMutation({
    mutationFn: (data: any) => createPet(data),
    ...options,
  });
}

export function useGetPetById(
  params: any,
  options?: Omit<UseQueryOptions<unknown, HTTPError>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: getPetByIdQueryKey(params),
    queryFn: () => getPetById(params),
    ...options,
  });
}
