// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2026-04-13T21:48:53.578Z

import type { z } from "zod";
import {
  getValidatedKyInstance,
  configureClient,
  type ValidatedKyClientOptions,
} from "./validator-client.js";
import type { NewPet, Pet } from "./schemas.js";

// Re-export for convenience
export { configureClient, type ValidatedKyClientOptions };

export async function listPets(
  queries?: { limit?: number },
  options?: RequestInit,
): Promise<Array<z.infer<typeof Pet>>> {
  const kyInstance = getValidatedKyInstance();
  const response = await kyInstance.get("/pets", {
    operationId: "listPets",
    inputs: { queries },
    searchParams: queries,
    ...options,
  } as any);
  return response.json();
}

export async function createPet(
  body: z.infer<typeof NewPet>,
  options?: RequestInit,
): Promise<z.infer<typeof Pet>> {
  const kyInstance = getValidatedKyInstance();
  const response = await kyInstance.post("/pets", {
    operationId: "createPet",
    json: body,
    ...options,
  } as any);
  return response.json();
}

export async function getPetById(
  params: { petId: string },
  options?: RequestInit,
): Promise<z.infer<typeof Pet>> {
  const kyInstance = getValidatedKyInstance();
  const response = await kyInstance.get(`/pets/${params.petId}`, {
    operationId: "getPetById",
    inputs: { params },
    ...options,
  } as any);
  return response.json();
}
