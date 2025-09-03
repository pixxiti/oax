// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T04:37:23.098Z

import { z } from "zod";

export const Pet = z.object({
  id: z.number().int(),
  name: z.string(),
  tag: z.string().optional(),
  status: z.enum(["available", "pending", "sold"]).optional(),
});

export const NewPet = z.object({
  name: z.string(),
  tag: z.string().optional(),
  status: z.enum(["available", "pending", "sold"]).optional(),
});

export const operations = {
  listPets: {
    method: "get",
    path: "/pets",
    operationId: "listPets",
    summary: "List all pets",
    description: undefined,
    params: z.object({}),
    queries: z.object({ limit: z.number().int().optional() }),
    headers: z.object({}),

    responses: {
      "200": {
        description: "A paged array of pets",
        schema: z.array(Pet),
      },
    },
  },
  createPet: {
    method: "post",
    path: "/pets",
    operationId: "createPet",
    summary: "Create a pet",
    description: undefined,
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: { schema: NewPet, required: true },
    responses: {
      "201": {
        description: "Pet created",
        schema: Pet,
      },
    },
  },
  getPetById: {
    method: "get",
    path: "/pets/{petId}",
    operationId: "getPetById",
    summary: "Info for a specific pet",
    description: undefined,
    params: z.object({ petId: z.string() }),
    queries: z.object({}),
    headers: z.object({}),

    responses: {
      "200": {
        description: "Expected response to a valid request",
        schema: Pet,
      },
    },
  },
} as const;

export type Operations = typeof operations;
