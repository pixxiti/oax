import { z } from "zod";
import { createClient as createRuntimeClient } from "@zoddy/core";

export const Order = z.object({
  id: z.number().int().optional(),
  petId: z.number().int().optional(),
  quantity: z.number().int().optional(),
  shipDate: z.iso.datetime().optional(),
  status: z.enum(["placed", "approved", "delivered"]).optional(),
  complete: z.boolean().optional(),
});

export const Category = z.object({
  id: z.number().int().optional(),
  name: z.string().optional(),
});

export const User = z.object({
  id: z.number().int().optional(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
  phone: z.string().optional(),
  userStatus: z.number().int().optional(),
});

export const Tag = z.object({
  id: z.number().int().optional(),
  name: z.string().optional(),
});

export const Pet = z.object({
  id: z.number().int().optional(),
  name: z.string(),
  category: z
    .object({ id: z.number().int().optional(), name: z.string().optional() })
    .optional(),
  photoUrls: z.array(z.string()),
  tags: z
    .array(
      z.object({
        id: z.number().int().optional(),
        name: z.string().optional(),
      }),
    )
    .optional(),
  status: z.enum(["available", "pending", "sold"]).optional(),
});

export const ApiResponse = z.object({
  code: z.number().int().optional(),
  type: z.string().optional(),
  message: z.string().optional(),
});

export const schemas = {
  Order,
  Category,
  User,
  Tag,
  Pet,
  ApiResponse,
};

export const operations = {
  addPet: {
    method: "post",
    path: "/pet",
    operationId: "addPet",
    summary: "Add a new pet to the store.",
    description: "Add a new pet to the store.",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: {
      schema: z.object({
        id: z.number().int().optional(),
        name: z.string(),
        category: z
          .object({
            id: z.number().int().optional(),
            name: z.string().optional(),
          })
          .optional(),
        photoUrls: z.array(z.string()),
        tags: z
          .array(
            z.object({
              id: z.number().int().optional(),
              name: z.string().optional(),
            }),
          )
          .optional(),
        status: z.enum(["available", "pending", "sold"]).optional(),
      }),
      required: true,
    },
    responses: {
      "200": {
        description: "Successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          name: z.string(),
          category: z
            .object({
              id: z.number().int().optional(),
              name: z.string().optional(),
            })
            .optional(),
          photoUrls: z.array(z.string()),
          tags: z
            .array(
              z.object({
                id: z.number().int().optional(),
                name: z.string().optional(),
              }),
            )
            .optional(),
          status: z.enum(["available", "pending", "sold"]).optional(),
        }),
      },
      "400": {
        description: "Invalid input",
        schema: z.void(),
      },
      "422": {
        description: "Validation exception",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  updatePet: {
    method: "put",
    path: "/pet",
    operationId: "updatePet",
    summary: "Update an existing pet.",
    description: "Update an existing pet by Id.",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: {
      schema: z.object({
        id: z.number().int().optional(),
        name: z.string(),
        category: z
          .object({
            id: z.number().int().optional(),
            name: z.string().optional(),
          })
          .optional(),
        photoUrls: z.array(z.string()),
        tags: z
          .array(
            z.object({
              id: z.number().int().optional(),
              name: z.string().optional(),
            }),
          )
          .optional(),
        status: z.enum(["available", "pending", "sold"]).optional(),
      }),
      required: true,
    },
    responses: {
      "200": {
        description: "Successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          name: z.string(),
          category: z
            .object({
              id: z.number().int().optional(),
              name: z.string().optional(),
            })
            .optional(),
          photoUrls: z.array(z.string()),
          tags: z
            .array(
              z.object({
                id: z.number().int().optional(),
                name: z.string().optional(),
              }),
            )
            .optional(),
          status: z.enum(["available", "pending", "sold"]).optional(),
        }),
      },
      "400": {
        description: "Invalid ID supplied",
        schema: z.void(),
      },
      "404": {
        description: "Pet not found",
        schema: z.void(),
      },
      "422": {
        description: "Validation exception",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  findPetsByStatus: {
    method: "get",
    path: "/pet/findByStatus",
    operationId: "findPetsByStatus",
    summary: "Finds Pets by status.",
    description:
      "Multiple status values can be provided with comma separated strings.",
    params: z.object({}),
    queries: z.object({ status: z.enum(["available", "pending", "sold"]) }),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.array(
          z.object({
            id: z.number().int().optional(),
            name: z.string(),
            category: z
              .object({
                id: z.number().int().optional(),
                name: z.string().optional(),
              })
              .optional(),
            photoUrls: z.array(z.string()),
            tags: z
              .array(
                z.object({
                  id: z.number().int().optional(),
                  name: z.string().optional(),
                }),
              )
              .optional(),
            status: z.enum(["available", "pending", "sold"]).optional(),
          }),
        ),
      },
      "400": {
        description: "Invalid status value",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  findPetsByTags: {
    method: "get",
    path: "/pet/findByTags",
    operationId: "findPetsByTags",
    summary: "Finds Pets by tags.",
    description:
      "Multiple tags can be provided with comma separated strings. Use tag1, tag2, tag3 for testing.",
    params: z.object({}),
    queries: z.object({ tags: z.array(z.string()) }),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.array(
          z.object({
            id: z.number().int().optional(),
            name: z.string(),
            category: z
              .object({
                id: z.number().int().optional(),
                name: z.string().optional(),
              })
              .optional(),
            photoUrls: z.array(z.string()),
            tags: z
              .array(
                z.object({
                  id: z.number().int().optional(),
                  name: z.string().optional(),
                }),
              )
              .optional(),
            status: z.enum(["available", "pending", "sold"]).optional(),
          }),
        ),
      },
      "400": {
        description: "Invalid tag value",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  getPetById: {
    method: "get",
    path: "/pet/{petId}",
    operationId: "getPetById",
    summary: "Find pet by ID.",
    description: "Returns a single pet.",
    params: z.object({ petId: z.number().int() }),
    queries: z.object({}),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          name: z.string(),
          category: z
            .object({
              id: z.number().int().optional(),
              name: z.string().optional(),
            })
            .optional(),
          photoUrls: z.array(z.string()),
          tags: z
            .array(
              z.object({
                id: z.number().int().optional(),
                name: z.string().optional(),
              }),
            )
            .optional(),
          status: z.enum(["available", "pending", "sold"]).optional(),
        }),
      },
      "400": {
        description: "Invalid ID supplied",
        schema: z.void(),
      },
      "404": {
        description: "Pet not found",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  updatePetWithForm: {
    method: "post",
    path: "/pet/{petId}",
    operationId: "updatePetWithForm",
    summary: "Updates a pet in the store with form data.",
    description: "Updates a pet resource based on the form data.",
    params: z.object({ petId: z.number().int() }),
    queries: z.object({
      name: z.string().optional(),
      status: z.string().optional(),
    }),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          name: z.string(),
          category: z
            .object({
              id: z.number().int().optional(),
              name: z.string().optional(),
            })
            .optional(),
          photoUrls: z.array(z.string()),
          tags: z
            .array(
              z.object({
                id: z.number().int().optional(),
                name: z.string().optional(),
              }),
            )
            .optional(),
          status: z.enum(["available", "pending", "sold"]).optional(),
        }),
      },
      "400": {
        description: "Invalid input",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  deletePet: {
    method: "delete",
    path: "/pet/{petId}",
    operationId: "deletePet",
    summary: "Deletes a pet.",
    description: "Delete a pet.",
    params: z.object({ petId: z.number().int() }),
    queries: z.object({}),
    headers: z.object({ api_key: z.string().optional() }),

    responses: {
      "200": {
        description: "Pet deleted",
        schema: z.void(),
      },
      "400": {
        description: "Invalid pet value",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  uploadFile: {
    method: "post",
    path: "/pet/{petId}/uploadImage",
    operationId: "uploadFile",
    summary: "Uploads an image.",
    description: "Upload image of the pet.",
    params: z.object({ petId: z.number().int() }),
    queries: z.object({ additionalMetadata: z.string().optional() }),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.object({
          code: z.number().int().optional(),
          type: z.string().optional(),
          message: z.string().optional(),
        }),
      },
      "400": {
        description: "No file uploaded",
        schema: z.void(),
      },
      "404": {
        description: "Pet not found",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  getInventory: {
    method: "get",
    path: "/store/inventory",
    operationId: "getInventory",
    summary: "Returns pet inventories by status.",
    description: "Returns a map of status codes to quantities.",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.record(z.string(), z.number().int()),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  placeOrder: {
    method: "post",
    path: "/store/order",
    operationId: "placeOrder",
    summary: "Place an order for a pet.",
    description: "Place a new order in the store.",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: {
      schema: z.object({
        id: z.number().int().optional(),
        petId: z.number().int().optional(),
        quantity: z.number().int().optional(),
        shipDate: z.iso.datetime().optional(),
        status: z.enum(["placed", "approved", "delivered"]).optional(),
        complete: z.boolean().optional(),
      }),
      required: false,
    },
    responses: {
      "200": {
        description: "successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          petId: z.number().int().optional(),
          quantity: z.number().int().optional(),
          shipDate: z.iso.datetime().optional(),
          status: z.enum(["placed", "approved", "delivered"]).optional(),
          complete: z.boolean().optional(),
        }),
      },
      "400": {
        description: "Invalid input",
        schema: z.void(),
      },
      "422": {
        description: "Validation exception",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  getOrderById: {
    method: "get",
    path: "/store/order/{orderId}",
    operationId: "getOrderById",
    summary: "Find purchase order by ID.",
    description:
      "For valid response try integer IDs with value <= 5 or > 10. Other values will generate exceptions.",
    params: z.object({ orderId: z.number().int() }),
    queries: z.object({}),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          petId: z.number().int().optional(),
          quantity: z.number().int().optional(),
          shipDate: z.iso.datetime().optional(),
          status: z.enum(["placed", "approved", "delivered"]).optional(),
          complete: z.boolean().optional(),
        }),
      },
      "400": {
        description: "Invalid ID supplied",
        schema: z.void(),
      },
      "404": {
        description: "Order not found",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  deleteOrder: {
    method: "delete",
    path: "/store/order/{orderId}",
    operationId: "deleteOrder",
    summary: "Delete purchase order by identifier.",
    description:
      "For valid response try integer IDs with value < 1000. Anything above 1000 or non-integers will generate API errors.",
    params: z.object({ orderId: z.number().int() }),
    queries: z.object({}),
    headers: z.object({}),

    responses: {
      "200": {
        description: "order deleted",
        schema: z.void(),
      },
      "400": {
        description: "Invalid ID supplied",
        schema: z.void(),
      },
      "404": {
        description: "Order not found",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  createUser: {
    method: "post",
    path: "/user",
    operationId: "createUser",
    summary: "Create user.",
    description: "This can only be done by the logged in user.",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: {
      schema: z.object({
        id: z.number().int().optional(),
        username: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        password: z.string().optional(),
        phone: z.string().optional(),
        userStatus: z.number().int().optional(),
      }),
      required: false,
    },
    responses: {
      "200": {
        description: "successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          username: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          password: z.string().optional(),
          phone: z.string().optional(),
          userStatus: z.number().int().optional(),
        }),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  createUsersWithListInput: {
    method: "post",
    path: "/user/createWithList",
    operationId: "createUsersWithListInput",
    summary: "Creates list of users with given input array.",
    description: "Creates list of users with given input array.",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: {
      schema: z.array(
        z.object({
          id: z.number().int().optional(),
          username: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          password: z.string().optional(),
          phone: z.string().optional(),
          userStatus: z.number().int().optional(),
        }),
      ),
      required: false,
    },
    responses: {
      "200": {
        description: "Successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          username: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          password: z.string().optional(),
          phone: z.string().optional(),
          userStatus: z.number().int().optional(),
        }),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  loginUser: {
    method: "get",
    path: "/user/login",
    operationId: "loginUser",
    summary: "Logs user into the system.",
    description: "Log into the system.",
    params: z.object({}),
    queries: z.object({
      username: z.string().optional(),
      password: z.string().optional(),
    }),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.string(),
      },
      "400": {
        description: "Invalid username/password supplied",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  logoutUser: {
    method: "get",
    path: "/user/logout",
    operationId: "logoutUser",
    summary: "Logs out current logged in user session.",
    description: "Log user out of the system.",
    params: z.object({}),
    queries: z.object({}),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  getUserByName: {
    method: "get",
    path: "/user/{username}",
    operationId: "getUserByName",
    summary: "Get user by user name.",
    description: "Get user detail based on username.",
    params: z.object({ username: z.string() }),
    queries: z.object({}),
    headers: z.object({}),

    responses: {
      "200": {
        description: "successful operation",
        schema: z.object({
          id: z.number().int().optional(),
          username: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          password: z.string().optional(),
          phone: z.string().optional(),
          userStatus: z.number().int().optional(),
        }),
      },
      "400": {
        description: "Invalid username supplied",
        schema: z.void(),
      },
      "404": {
        description: "User not found",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  updateUser: {
    method: "put",
    path: "/user/{username}",
    operationId: "updateUser",
    summary: "Update user resource.",
    description: "This can only be done by the logged in user.",
    params: z.object({ username: z.string() }),
    queries: z.object({}),
    headers: z.object({}),
    requestBody: {
      schema: z.object({
        id: z.number().int().optional(),
        username: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        password: z.string().optional(),
        phone: z.string().optional(),
        userStatus: z.number().int().optional(),
      }),
      required: false,
    },
    responses: {
      "200": {
        description: "successful operation",
        schema: z.void(),
      },
      "400": {
        description: "bad request",
        schema: z.void(),
      },
      "404": {
        description: "user not found",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
  deleteUser: {
    method: "delete",
    path: "/user/{username}",
    operationId: "deleteUser",
    summary: "Delete user resource.",
    description: "This can only be done by the logged in user.",
    params: z.object({ username: z.string() }),
    queries: z.object({}),
    headers: z.object({}),

    responses: {
      "200": {
        description: "User deleted",
        schema: z.void(),
      },
      "400": {
        description: "Invalid username supplied",
        schema: z.void(),
      },
      "404": {
        description: "User not found",
        schema: z.void(),
      },
      default: {
        description: "Unexpected error",
        schema: z.void(),
      },
    },
  },
} as const;

export type Operations = typeof operations;

export function createClient(
  baseUrl: string,
  options?: { headers?: Record<string, string> },
) {
  return createRuntimeClient(baseUrl, operations, options);
}
