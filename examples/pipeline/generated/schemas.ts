// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2026-04-13T20:03:02.086Z

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

    queries: z.object({ limit: z.number().int().optional() }),

    response: z.array(Pet),
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

    requestBody: { schema: NewPet, required: true },
    response: Pet,
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

    response: Pet,
    responses: {
      "200": {
        description: "Expected response to a valid request",
        schema: Pet,
      },
    },
  },
} as const;

export type Operations = typeof operations;
