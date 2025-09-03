// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T16:32:03.380Z

import { useQuery, useMutation } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";
import type { HTTPError } from "ky";
import type { z } from "zod";
import { listPets, createPet, getPetById } from "./client";
import type { operations, NewPet } from "./schemas";
import { listPetsQueryKey, getPetByIdQueryKey } from "./querykeys";

export function useListPets(
  params?: undefined,
  queries?: z.infer<typeof operations.listPets.queries>,
  options?: Omit<
    UseQueryOptions<
      z.infer<(typeof operations.listPets.responses)["200"]["schema"]>,
      HTTPError
    >,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: listPetsQueryKey(params, queries),
    queryFn: () => listPets(params),
    ...options,
  });
}

export function useCreatePet(
  options?: UseMutationOptions<
    z.infer<(typeof operations.createPet.responses)["201"]["schema"]>,
    HTTPError,
    z.infer<typeof NewPet>
  >,
) {
  return useMutation({
    mutationFn: (data: z.infer<typeof NewPet>) => createPet(data),
    ...options,
  });
}

export function useGetPetById(
  params: z.infer<typeof operations.getPetById.params>,
  options?: Omit<
    UseQueryOptions<
      z.infer<(typeof operations.getPetById.responses)["200"]["schema"]>,
      HTTPError
    >,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: getPetByIdQueryKey(params),
    queryFn: () => getPetById(params),
    ...options,
  });
}
