import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiClient, type Operations, createClient } from "../src/index";

// Mock ky for testing
vi.mock("ky", async () => {
  // Create a mock HTTPError class
  class MockHTTPError extends Error {
    constructor(
      public response: Response,
      public request: Request,
      public options: any
    ) {
      super("HTTP Error");
    }
  }

  const mockResponse = {
    json: vi.fn(),
    text: vi.fn(),
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
  };

  const mockKy = vi.fn().mockResolvedValue(mockResponse);
  // @ts-ignore - we are mocking the create method
  mockKy.create = vi.fn().mockReturnValue(mockKy);
  // @ts-ignore - we are mocking the extend method
  mockKy.extend = vi.fn().mockReturnValue(mockKy);

  return {
    default: mockKy,
    HTTPError: MockHTTPError,
  };
});

const mockOperations: Operations = {
  getUser: {
    operationId: "getUser",
    method: "get",
    path: "/users/{id}",
    params: z.object({
      id: z.string(),
    }),
    queries: z.object({
      include: z.array(z.string()).optional(),
    }),
    headers: z.object({}),
    requestBody: undefined,
    responses: {
      "200": {
        description: "Success",
        schema: z.object({
          id: z.string(),
          name: z.string(),
          email: z.email(),
        }),
      },
    },
  },
  createUser: {
    operationId: "createUser",
    method: "post",
    path: "/users",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: {
      schema: z.object({
        name: z.string().min(1),
        email: z.email(),
        age: z.number().int().min(0),
      }),
      required: true,
    },
    responses: {
      "201": {
        description: "Created",
        schema: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
        }),
      },
    },
  },
  simpleGet: {
    operationId: "simpleGet",
    method: "get",
    path: "/simple",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: undefined,
    responses: {
      "204": {
        description: "No content",
      },
    },
  },
};

describe("ApiClient", () => {
  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("constructor", () => {
    it("should create ApiClient with validation enabled by default", () => {
      const client = new ApiClient("https://api.example.com", mockOperations);
      expect(client).toBeInstanceOf(ApiClient);
    });

    it("should create ApiClient with validation disabled", () => {
      const client = new ApiClient("https://api.example.com", mockOperations, {
        validate: false,
      });
      expect(client).toBeInstanceOf(ApiClient);
    });

    it("should create ApiClient with custom headers", () => {
      const client = new ApiClient("https://api.example.com", mockOperations, {
        headers: { Authorization: "Bearer token" },
      });
      expect(client).toBeInstanceOf(ApiClient);
    });

    it("should handle ky.create call correctly for validation", async () => {
      const ky = await import("ky");
      new ApiClient("https://api.example.com", mockOperations);

      expect(ky.default.create).toHaveBeenCalledWith({
        prefixUrl: "https://api.example.com",
        hooks: {
          beforeRequest: expect.any(Array),
          afterResponse: expect.any(Array),
        },
      });
    });
  });
});

describe("createClient", () => {
  it("should create typed client with operation methods", () => {
    const client = createClient("https://api.example.com", mockOperations);

    expect(client).toBeInstanceOf(ApiClient);
    expect(typeof client.getUser).toBe("function");
    expect(typeof client.createUser).toBe("function");
    expect(typeof client.simpleGet).toBe("function");
    expect(typeof client.ky).toBe("function"); // request method should be available
  });

  it("should create client with options", () => {
    const client = createClient("https://api.example.com", mockOperations, {
      headers: { Authorization: "Bearer token" },
      validate: false,
    });

    expect(client).toBeInstanceOf(ApiClient);
  });

  it("should bind operation methods correctly", async () => {
    const ky = await import("ky");
    const mockResponse = {
      json: vi.fn().mockResolvedValue({
        id: "user123",
        name: "John Doe",
        email: "john@example.com",
      }),
      headers: new Map([["content-type", "application/json"]]),
      status: 200,
    };

    (ky.default as any).mockResolvedValue(mockResponse);

    const client = createClient("https://api.example.com", mockOperations);

    const result = await client.getUser({ params: { id: "user123" } });

    expect(result).toEqual({
      id: "user123",
      name: "John Doe",
      email: "john@example.com",
    });
  });

  describe("client requests", () => {
    it("should have access to the underlying ky instance", () => {
      const client = createClient("https://api.example.com", mockOperations);
      expect(typeof client.ky).toBe("function");
    });

    it("should be able to make direct requests with ky", async () => {
      const ky = await import("ky");
      const mockResponse = {
        json: vi.fn().mockResolvedValue({ success: true }),
        headers: new Map([["content-type", "application/json"]]),
        status: 200,
      };

      (ky.default as any).mockResolvedValue(mockResponse);

      const client = createClient("https://api.example.com", mockOperations);

      const result = await client.ky("custom-endpoint");

      expect(result).toBe(mockResponse);
      expect(ky.default).toHaveBeenCalledWith("custom-endpoint");
    });
  });
});
