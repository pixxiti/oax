// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T04:37:23.109Z

import ky from "ky";
import type { z } from "zod";
import type { NewPet, Pet } from "./schemas";

export interface KyClientOptions {
  baseUrl: string;
  prefixUrl?: string;
}

let clientOptions: KyClientOptions | undefined;

export function configureClient(options: KyClientOptions) {
  clientOptions = options;
}

function getKyInstance() {
  if (!clientOptions) {
    throw new Error("Client not configured. Call configureClient() first.");
  }
  return ky.create({
    prefixUrl: clientOptions.prefixUrl || clientOptions.baseUrl,
  });
}

export async function listPets(
  queries?: { limit?: number },
  options?: RequestInit,
): Promise<Array<z.infer<typeof Pet>>> {
  const kyInstance = getKyInstance();
  const response = await kyInstance.get("/pets", {
    searchParams: queries,
    ...options,
  });
  return response.json();
}

export async function createPet(
  body: z.infer<typeof NewPet>,
  options?: RequestInit,
): Promise<z.infer<typeof Pet>> {
  const kyInstance = getKyInstance();
  const response = await kyInstance.post("/pets", { json: body, ...options });
  return response.json();
}

export async function getPetById(
  params: { petId: string },
  options?: RequestInit,
): Promise<z.infer<typeof Pet>> {
  const kyInstance = getKyInstance();
  const response = await kyInstance.get(`/pets/${params.petId}`, {
    ...options,
  });
  return response.json();
}
