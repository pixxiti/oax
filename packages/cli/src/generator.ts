import type { OpenAPIV3 } from "openapi-types";
import prettier from "prettier";
import { type ZodType, z } from "zod";

export async function parseOAS(filePath: string): Promise<OpenAPIV3.Document> {
  try {
    const SwaggerParser = await import("@apidevtools/swagger-parser");
    const api = (await SwaggerParser.default.validate(filePath)) as OpenAPIV3.Document;
    return api;
  } catch (error) {
    console.error("Error parsing OAS file:", error);
    throw error;
  }
}

export async function generateClient(oas: OpenAPIV3.Document): Promise<string> {
  const schemas = generateZodSchemas(oas);
  const operations = generateOperations(oas);

  const schemaCode = generateSchemaCode(schemas);
  const operationsCode = generateOperationsCode(operations);
  const code = `import { z } from 'zod';
import { createClient as createRuntimeClient, type ClientOptions } from '@zoddy/core';

${schemaCode}

${operationsCode}

export function createClient(baseUrl: string, options?: ClientOptions) {
  return createRuntimeClient(baseUrl, operations, options);
}
`;

  return prettier.format(code, { parser: "typescript" });
}

interface ZodSchemaInfo {
  name: string;
  schema: ZodType;
  zodCode: string;
}

function generateSchemaCode(schemas: ZodSchemaInfo[]): string {
  const schemaExports = schemas
    .map(({ name, zodCode }) => `export const ${name} = ${zodCode};`)
    .join("\n\n");

  const schemasObject = schemas.map(({ name }) => `  ${name}`).join(",\n");

  return `${schemaExports}

export const schemas = {
${schemasObject}
};`;
}

interface OperationInfo {
  operationId: string;
  method: string;
  path: string;
  parameters: ParameterInfo[];
  requestBody?: SchemaReference;
  responses: ResponseInfo[];
  summary?: string;
  description?: string;
}

interface ParameterInfo {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: SchemaReference;
}

interface ResponseInfo {
  status: string;
  description?: string;
  schema?: SchemaReference;
}

interface SchemaReference {
  zodCode: string;
  required: boolean;
}

function generateOperations(oas: OpenAPIV3.Document): OperationInfo[] {
  const operations: OperationInfo[] = [];

  if (!oas.paths) return operations;

  for (const [pathTemplate, pathItem] of Object.entries(oas.paths)) {
    if (!pathItem) continue;

    const methods = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

    for (const method of methods) {
      const operation = (pathItem as any)[method] as OpenAPIV3.OperationObject;
      if (!operation) continue;

      const operationId =
        operation.operationId || `${method}${pathTemplate.replace(/[^a-zA-Z0-9]/g, "")}`;

      const parameters: ParameterInfo[] = [];
      if (operation.parameters) {
        for (const param of operation.parameters) {
          if ("$ref" in param) continue; // Skip refs for now

          const paramObj = param as OpenAPIV3.ParameterObject;
          parameters.push({
            name: paramObj.name,
            in: paramObj.in as ParameterInfo["in"],
            required: paramObj.required || false,
            schema: {
              zodCode: generateZodCodeFromSchema(paramObj.schema),
              required: paramObj.required || false,
            },
          });
        }
      }

      let requestBody: SchemaReference | undefined;
      if (operation.requestBody && !("$ref" in operation.requestBody)) {
        const content = operation.requestBody.content?.["application/json"];
        if (content?.schema) {
          requestBody = {
            zodCode: generateZodCodeFromSchema(content.schema),
            required: operation.requestBody.required || false,
          };
        }
      }

      const responses: ResponseInfo[] = [];
      if (operation.responses) {
        for (const [status, response] of Object.entries(operation.responses)) {
          if (!response || "$ref" in response) continue;

          const responseObj = response as OpenAPIV3.ResponseObject;
          const content = responseObj.content?.["application/json"];
          const responseInfo: ResponseInfo = {
            status,
          };

          if (responseObj.description) {
            responseInfo.description = responseObj.description;
          }

          if (content?.schema) {
            responseInfo.schema = {
              zodCode: generateZodCodeFromSchema(content.schema),
              required: true,
            };
          }

          responses.push(responseInfo);
        }
      }

      const operationInfo: OperationInfo = {
        operationId,
        method,
        path: pathTemplate,
        parameters,
        responses,
      };

      if (operation.summary) operationInfo.summary = operation.summary;
      if (operation.description) operationInfo.description = operation.description;

      if (requestBody) {
        operationInfo.requestBody = requestBody;
      }

      operations.push(operationInfo);
    }
  }

  return operations;
}

function generateOperationsCode(operations: OperationInfo[]): string {
  const operationObjects = operations
    .map((op) => {
      // Group parameters by type
      const pathParams = op.parameters.filter((p) => p.in === "path");
      const queryParams = op.parameters.filter((p) => p.in === "query");
      const headerParams = op.parameters.filter((p) => p.in === "header");

      // Generate parameter objects for each type
      const generateParamObject = (params: ParameterInfo[]) => {
        if (params.length === 0) return "z.object({})";

        const properties = params
          .map((p) => `${p.name}: ${p.schema.zodCode}${p.required ? "" : ".optional()"}`)
          .join(", ");

        return `z.object({ ${properties} })`;
      };

      const pathParamsCode = generateParamObject(pathParams);
      const queryParamsCode = generateParamObject(queryParams);
      const headerParamsCode = generateParamObject(headerParams);

      const requestBodyCode = op.requestBody
        ? `requestBody: { schema: ${op.requestBody.zodCode}, required: ${op.requestBody.required} },`
        : "";

      const responsesCode = op.responses
        .map(
          (r) => `
    '${r.status}': {
      description: ${r.description ? `'${r.description}'` : "undefined"},
      schema: ${r.schema ? r.schema.zodCode : "z.void()"}
    }`
        )
        .join(",");

      return `
  '${op.operationId}': {
    method: '${op.method}',
    path: '${op.path}',
    operationId: '${op.operationId}',
    summary: ${op.summary ? `'${op.summary}'` : "undefined"},
    description: ${op.description ? `'${op.description}'` : "undefined"},
    params: ${pathParamsCode},
    queries: ${queryParamsCode},
    headers: ${headerParamsCode},
    ${requestBodyCode}
    responses: {${responsesCode}
    }
  }`;
    })
    .join(",");

  return `export const operations = {${operationObjects}
} as const;

export type Operations = typeof operations;`;
}

function generateZodSchemas(oas: OpenAPIV3.Document): ZodSchemaInfo[] {
  const schemas: ZodSchemaInfo[] = [];

  if (!oas.components?.schemas) return schemas;

  for (const [name, schema] of Object.entries(oas.components.schemas)) {
    if (!schema || typeof schema !== "object" || "$ref" in schema) continue;

    const zodCode = generateZodCodeFromSchema(schema as OpenAPIV3.SchemaObject);

    schemas.push({
      name,
      schema: z.any(), // We'll use the code representation instead
      zodCode,
    });
  }

  return schemas;
}

function generateZodCodeFromSchema(schema: any): string {
  if (!schema) return "z.any()";

  // Handle $ref
  if ("$ref" in schema) {
    const refName = schema.$ref.split("/").pop();
    return refName || "z.any()";
  }

  // Handle composition operators (allOf, anyOf, oneOf)
  if (schema.allOf) {
    const schemas = schema.allOf.map((s: any) => generateZodCodeFromSchema(s));
    if (schemas.length === 1) {
      return schemas[0];
    }
    return schemas.reduce((acc: string, curr: string, index: number) =>
      index === 1 ? `z.intersection(${acc}, ${curr})` : `z.intersection(${acc}, ${curr})`
    );
  }

  if (schema.anyOf) {
    const schemas = schema.anyOf.map((s: any) => generateZodCodeFromSchema(s));
    return `z.union([${schemas.join(", ")}])`;
  }

  if (schema.oneOf) {
    const schemas = schema.oneOf.map((s: any) => generateZodCodeFromSchema(s));
    // Handle discriminated unions if discriminator is present
    if (schema.discriminator) {
      return `z.discriminatedUnion("${schema.discriminator.propertyName}", [${schemas.join(", ")}])`;
    }
    return `z.union([${schemas.join(", ")}])`;
  }

  // Handle nullable
  const isNullable = schema.nullable === true;
  const baseSchema = generateBaseZodSchema(schema);

  return isNullable ? `${baseSchema}.nullable()` : baseSchema;
}

function generateBaseZodSchema(schema: any): string {
  switch (schema.type) {
    case "string":
      return generateStringSchema(schema);
    case "number":
      return generateNumberSchema(schema);
    case "integer":
      return generateIntegerSchema(schema);
    case "boolean":
      return "z.boolean()";
    case "array":
      return generateArraySchema(schema);
    case "object":
      return generateObjectSchema(schema);
    default:
      return "z.any()";
  }
}

function generateStringSchema(schema: any): string {
  let zodSchema = "z.string()";

  // Handle enums
  if (schema.enum) {
    return `z.enum([${schema.enum.map((v: string) => `'${v}'`).join(", ")}])`;
  }

  // Handle string formats
  if (schema.format) {
    switch (schema.format) {
      case "date-time":
        return "z.iso.datetime()";
      case "date":
        zodSchema += ".date()";
        break;
      case "time":
        zodSchema += ".time()";
        break;
      case "email":
        return "z.email()";
      case "uri":
      case "url":
        return "z.url()";
      case "uuid":
        zodSchema += ".uuid()";
        break;
      case "ipv4":
        zodSchema += ".ip({ version: 'v4' })";
        break;
      case "ipv6":
        zodSchema += ".ip({ version: 'v6' })";
        break;
      default:
        // Keep as string for unknown formats
        break;
    }
  }

  // Handle string constraints
  if (schema.minLength !== undefined) {
    zodSchema += `.min(${schema.minLength})`;
  }
  if (schema.maxLength !== undefined) {
    zodSchema += `.max(${schema.maxLength})`;
  }
  if (schema.pattern) {
    // Escape the regex pattern for JavaScript regex literal
    const escapedPattern = schema.pattern.replace(/\\/g, "\\\\").replace(/\//g, "\\/");
    zodSchema += `.regex(/${escapedPattern}/)`;
  }

  return zodSchema;
}

function generateNumberSchema(schema: any): string {
  let zodSchema = "z.number()";

  // Handle number constraints
  if (schema.minimum !== undefined) {
    if (schema.exclusiveMinimum === true) {
      zodSchema += `.gt(${schema.minimum})`;
    } else {
      zodSchema += `.gte(${schema.minimum})`;
    }
  }
  if (schema.exclusiveMinimum !== undefined && typeof schema.exclusiveMinimum === "number") {
    zodSchema += `.gt(${schema.exclusiveMinimum})`;
  }
  if (schema.maximum !== undefined) {
    if (schema.exclusiveMaximum === true) {
      zodSchema += `.lt(${schema.maximum})`;
    } else {
      zodSchema += `.lte(${schema.maximum})`;
    }
  }
  if (schema.exclusiveMaximum !== undefined && typeof schema.exclusiveMaximum === "number") {
    zodSchema += `.lt(${schema.exclusiveMaximum})`;
  }
  if (schema.multipleOf !== undefined) {
    zodSchema += `.multipleOf(${schema.multipleOf})`;
  }

  return zodSchema;
}

function generateIntegerSchema(schema: any): string {
  let zodSchema = "z.number().int()";

  // Handle integer constraints (same as number)
  if (schema.minimum !== undefined) {
    if (schema.exclusiveMinimum === true) {
      zodSchema += `.gt(${schema.minimum})`;
    } else {
      zodSchema += `.gte(${schema.minimum})`;
    }
  }
  if (schema.exclusiveMinimum !== undefined && typeof schema.exclusiveMinimum === "number") {
    zodSchema += `.gt(${schema.exclusiveMinimum})`;
  }
  if (schema.maximum !== undefined) {
    if (schema.exclusiveMaximum === true) {
      zodSchema += `.lt(${schema.maximum})`;
    } else {
      zodSchema += `.lte(${schema.maximum})`;
    }
  }
  if (schema.exclusiveMaximum !== undefined && typeof schema.exclusiveMaximum === "number") {
    zodSchema += `.lt(${schema.exclusiveMaximum})`;
  }
  if (schema.multipleOf !== undefined) {
    zodSchema += `.multipleOf(${schema.multipleOf})`;
  }

  return zodSchema;
}

function generateArraySchema(schema: any): string {
  let itemSchema = "z.any()";
  if (schema.items) {
    itemSchema = generateZodCodeFromSchema(schema.items);
  }

  let zodSchema = `z.array(${itemSchema})`;

  // Handle array constraints
  if (schema.minItems !== undefined) {
    zodSchema += `.min(${schema.minItems})`;
  }
  if (schema.maxItems !== undefined) {
    zodSchema += `.max(${schema.maxItems})`;
  }
  if (schema.uniqueItems === true) {
    // Zod doesn't have built-in uniqueItems, but we can use a custom refinement
    zodSchema = `${zodSchema}.refine((items) => new Set(items).size === items.length, { message: "Items must be unique" })`;
  }

  return zodSchema;
}

function generateObjectSchema(schema: any): string {
  if (!schema.properties) {
    // Handle additionalProperties for record-like objects
    if (schema.additionalProperties === false) {
      return "z.object({}).strict()";
    }
    if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
      return "z.record(z.string(), z.any())";
    }
    if (typeof schema.additionalProperties === "object") {
      const valueSchema = generateZodCodeFromSchema(schema.additionalProperties);
      return `z.record(z.string(), ${valueSchema})`;
    }
    return "z.record(z.string(), z.any())";
  }

  const properties = Object.entries(schema.properties)
    .map(([name, prop]: [string, any]) => {
      const isRequired = schema.required?.includes(name) || false;
      const zodCode = generateZodCodeFromSchema(prop);
      const optionalSuffix = isRequired ? "" : ".optional()";

      // Handle deprecated properties with description
      if (prop.deprecated === true) {
        return `${name}: ${zodCode}${optionalSuffix} /* @deprecated */`;
      }

      return `${name}: ${zodCode}${optionalSuffix}`;
    })
    .join(", ");

  let zodSchema = `z.object({ ${properties} })`;

  // Handle additionalProperties
  if (schema.additionalProperties === false) {
    zodSchema += ".strict()";
  } else if (schema.additionalProperties === true) {
    zodSchema += ".passthrough()";
  } else if (typeof schema.additionalProperties === "object") {
    // This is more complex - Zod doesn't directly support typed additional properties
    // We'll use passthrough() and add a comment
    zodSchema += ".passthrough() /* additional properties allowed */";
  }

  // Handle object constraints
  if (schema.minProperties !== undefined) {
    zodSchema = `${zodSchema}.refine((obj) => Object.keys(obj).length >= ${schema.minProperties}, { message: "Object must have at least ${schema.minProperties} properties" })`;
  }
  if (schema.maxProperties !== undefined) {
    zodSchema = `${zodSchema}.refine((obj) => Object.keys(obj).length <= ${schema.maxProperties}, { message: "Object must have at most ${schema.maxProperties} properties" })`;
  }

  return zodSchema;
}
