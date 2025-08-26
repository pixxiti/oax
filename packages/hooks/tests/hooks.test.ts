import type { Operations } from "@oax/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHooks, generateQueryKey } from "../src/index";

// Mock React Query
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((options) => ({
    data: null,
    isLoading: false,
    error: null,
    queryKey: options.queryKey,
    queryFn: options.queryFn,
  })),
  useMutation: vi.fn((options) => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    data: null,
    isLoading: false,
    error: null,
    mutationFn: options.mutationFn,
  })),
}));

// Mock operations similar to what would be generated
const mockOperations = {
  getPetById: {
    method: "get",
    path: "/pets/{petId}",
    operationId: "getPetById",
    params: z.object({
      petId: z.string(),
    }),
    queries: z.object({}),
    headers: z.object({}),
    responses: {
      "200": {
        description: "Pet details",
        schema: z.object({ id: z.string(), name: z.string() }),
      },
    },
  },
  getUsersByStatus: {
    method: "get",
    path: "/users",
    operationId: "getUsersByStatus",
    params: z.object({}),
    queries: z.object({
      status: z.string().optional(),
      limit: z.number().optional(),
    }),
    headers: z.object({}),
    responses: {
      "200": {
        description: "List of users",
        schema: z.array(z.object({ id: z.string(), name: z.string() })),
      },
    },
  },
  createPet: {
    method: "post",
    path: "/pets",
    operationId: "createPet",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: {
      required: true,
      schema: z.object({ name: z.string(), species: z.string() }),
    },
    responses: {
      "201": {
        description: "Pet created",
        schema: z.object({ id: z.string(), name: z.string() }),
      },
    },
  },
} as const satisfies Operations;

// Mock client
const mockClient = {
  getPetById: vi.fn().mockResolvedValue({ id: "1", name: "Fluffy" }),
  getUsersByStatus: vi.fn().mockResolvedValue([{ id: "1", name: "John" }]),
  createPet: vi.fn().mockResolvedValue({ id: "2", name: "Whiskers" }),
};

describe("createHooks", () => {
  it("should create hooks for all operations", () => {
    const hooks = createHooks({
      apiName: "petstore",
      client: mockClient,
      operations: mockOperations,
    });

    expect(typeof hooks.useGetPetById).toBe("function");
    expect(typeof hooks.useGetUsersByStatus).toBe("function");
    expect(typeof hooks.useCreatePet).toBe("function");
    expect(typeof hooks.getKey).toBe("function");
  });

  it("should return useQuery result with proper properties for GET operations", () => {
    const hooks = createHooks({
      apiName: "petstore",
      client: mockClient,
      operations: mockOperations,
    });

    const result = hooks.useGetPetById({ params: { petId: "1" } }, { enabled: true });

    // Verify that the hook returns the expected useQuery properties
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("isLoading");
    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("queryKey");
    expect(result).toHaveProperty("queryFn");
  });

  it("should return useMutation result with proper properties for POST operations", () => {
    const hooks = createHooks({
      apiName: "petstore",
      client: mockClient,
      operations: mockOperations,
    });

    const result = hooks.useCreatePet();

    result.mutate({ name: "Whiskers", species: "cat" });

    // Verify that the hook returns the expected useMutation properties
    expect(result).toHaveProperty("mutate");
    expect(result).toHaveProperty("mutateAsync");
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("isLoading");
    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("mutationFn");
  });

  it("should work with structured query parameters", () => {
    const hooks = createHooks({
      apiName: "petstore",
      client: mockClient,
      operations: mockOperations,
    });

    // Test with query parameters using new structured format
    const result = hooks.useGetUsersByStatus(
      {
        queries: { status: "active", limit: 10 },
      },
      { enabled: true }
    );

    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("isLoading");
    expect(result).toHaveProperty("error");
  });

  it("should generate correct query keys for path parameters", () => {
    const hooks = createHooks({
      apiName: "petstore",
      client: mockClient,
      operations: mockOperations,
    });

    const queryKey = hooks.getKey("getPetById", { params: { petId: "123" } });
    expect(queryKey).toEqual([{ apiName: "petstore", path: "/pets/:petId" }, { petId: "123" }]);
  });

  it("should generate correct query keys for query parameters", () => {
    const hooks = createHooks({
      apiName: "petstore",
      client: mockClient,
      operations: mockOperations,
    });

    const queryKey = hooks.getKey("getUsersByStatus", {
      queries: { status: "active", limit: 10 },
    });
    expect(queryKey).toEqual([
      { apiName: "petstore", path: "/users" },
      { status: "active", limit: 10 },
    ]);
  });

  it("should generate correct query keys for both path and query parameters", () => {
    // Add a mock operation with both path and query params
    const operationsWithBoth = {
      ...mockOperations,
      getUserPets: {
        method: "get",
        path: "/users/{userId}/pets",
        operationId: "getUserPets",
        params: z.object({
          userId: z.string(),
        }),
        queries: z.object({
          status: z.string().optional(),
        }),
        headers: z.object({}),
        responses: {
          "200": {
            description: "User pets",
            schema: z.array(z.object({ id: z.string(), name: z.string() })),
          },
        },
      },
    } as const satisfies Operations;

    const hooks = createHooks({
      apiName: "petstore",
      client: { ...mockClient, getUserPets: vi.fn() },
      operations: operationsWithBoth,
    });

    const queryKey = hooks.getKey("getUserPets", {
      params: { userId: "123" },
      queries: { status: "active" },
    });

    expect(queryKey).toEqual([
      { apiName: "petstore", path: "/users/:userId/pets" },
      { userId: "123" },
      { status: "active" },
    ]);
  });

  it("should generate base query key when no parameters provided", () => {
    const hooks = createHooks({
      apiName: "petstore",
      client: mockClient,
      operations: mockOperations,
    });

    const queryKey = hooks.getKey("createPet");
    expect(queryKey).toEqual([{ apiName: "petstore", path: "/pets" }]);
  });

  it("should handle operations without query parameters correctly", () => {
    const hooks = createHooks({
      apiName: "petstore",
      client: mockClient,
      operations: mockOperations,
    });

    const queryKey = hooks.getKey("getPetById", { params: { petId: "123" } });
    expect(queryKey).toEqual([{ apiName: "petstore", path: "/pets/:petId" }, { petId: "123" }]);
    // Should not include the queries array since there are no query parameters
    expect(queryKey).toHaveLength(2);
  });

  describe("getKey vs generateQueryKey consistency", () => {
    const apiName = "petstore";

    it("should return identical results for no parameters", () => {
      const hooks = createHooks({
        apiName,
        client: mockClient,
        operations: mockOperations,
      });

      const operationId = "createPet";
      const operation = mockOperations[operationId];

      const getKeyResult = hooks.getKey(operationId);
      const generateQueryKeyResult = generateQueryKey(apiName, operationId, operation);

      expect(getKeyResult).toEqual(generateQueryKeyResult);
    });

    it("should return identical results for path parameters", () => {
      const hooks = createHooks({
        apiName,
        client: mockClient,
        operations: mockOperations,
      });

      const operationId = "getPetById";
      const operation = mockOperations[operationId];
      const params = { params: { petId: "123" } };

      const getKeyResult = hooks.getKey(operationId, params);
      const generateQueryKeyResult = generateQueryKey(
        apiName,
        operationId,
        operation,
        params as any
      );

      expect(getKeyResult).toEqual(generateQueryKeyResult);
    });

    it("should return identical results for query parameters", () => {
      const hooks = createHooks({
        apiName,
        client: mockClient,
        operations: mockOperations,
      });

      const operationId = "getUsersByStatus";
      const operation = mockOperations[operationId];
      const params = { queries: { status: "active", limit: 10 } };

      const getKeyResult = hooks.getKey(operationId, params);
      const generateQueryKeyResult = generateQueryKey(
        apiName,
        operationId,
        operation,
        params as any
      );

      expect(getKeyResult).toEqual(generateQueryKeyResult);
    });

    it("should return identical results for both path and query parameters", () => {
      const operationsWithBoth = {
        ...mockOperations,
        getUserPets: {
          method: "get",
          path: "/users/{userId}/pets",
          operationId: "getUserPets",

          params: z.object({
            userId: z.string(),
          }),
          queries: z.object({
            status: z.string().optional(),
          }),
          headers: z.object({}),
          responses: {
            "200": {
              description: "User pets",
              schema: z.array(z.object({ id: z.string(), name: z.string() })),
            },
          },
        },
      } as const satisfies Operations;

      const hooks = createHooks({
        apiName,
        client: { ...mockClient, getUserPets: vi.fn() },
        operations: operationsWithBoth,
      });

      const operationId = "getUserPets";
      const operation = operationsWithBoth[operationId];
      const params = {
        params: { userId: "123" },
        queries: { status: "active" },
      };

      const getKeyResult = hooks.getKey(operationId, params);
      const generateQueryKeyResult = generateQueryKey(
        apiName,
        operationId,
        operation,
        params as any
      );

      expect(getKeyResult).toEqual(generateQueryKeyResult);
    });

    it("should return identical results for headers", () => {
      const operationsWithHeaders = {
        ...mockOperations,
        getProtectedData: {
          method: "get",
          path: "/protected",
          operationId: "getProtectedData",
          params: z.object({}),
          queries: z.object({}),
          headers: z.object({
            authorization: z.string(),
            "x-api-key": z.string(),
          }),
          responses: {
            "200": {
              description: "Protected data",
              schema: z.object({ data: z.string() }),
            },
          },
        },
      } as const satisfies Operations;

      const hooks = createHooks({
        apiName,
        client: { ...mockClient, getProtectedData: vi.fn() },
        operations: operationsWithHeaders,
      });

      const operationId = "getProtectedData";
      const operation = operationsWithHeaders[operationId];
      const params = {
        headers: { authorization: "Bearer token", "x-api-key": "key123" },
      };

      const getKeyResult = hooks.getKey(operationId, params);
      const generateQueryKeyResult = generateQueryKey(
        apiName,
        operationId,
        operation,
        params as any
      );

      expect(getKeyResult).toEqual(generateQueryKeyResult);
    });

    it("should return identical results for mixed parameter types", () => {
      const operationsWithMixed = {
        ...mockOperations,
        getComplexData: {
          method: "get",
          path: "/data/{id}",
          operationId: "getComplexData",
          params: z.object({
            id: z.string(),
          }),
          queries: z.object({
            filter: z.string().optional(),
          }),
          headers: z.object({
            authorization: z.string(),
          }),
          responses: {
            "200": {
              description: "Complex data",
              schema: z.object({ result: z.any() }),
            },
          },
        },
      } as const satisfies Operations;

      const hooks = createHooks({
        apiName,
        client: { ...mockClient, getComplexData: vi.fn() },
        operations: operationsWithMixed,
      });

      const operationId = "getComplexData";
      const operation = operationsWithMixed[operationId];
      const params = {
        params: { id: "123" },
        queries: { filter: "active" },
        headers: { authorization: "Bearer token" },
      };

      const getKeyResult = hooks.getKey(operationId, params);
      const generateQueryKeyResult = generateQueryKey(
        apiName,
        operationId,
        operation,
        params as any
      );

      expect(getKeyResult).toEqual(generateQueryKeyResult);
    });
  });
});
