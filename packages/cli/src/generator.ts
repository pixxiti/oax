import type { OpenAPIV3 } from "openapi-types";
import { format as prettierFormat } from "prettier";
import { type ZodType, z } from "zod";

function isIdentifier(code: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(code);
}

export function sanitizeIdentifier(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized;
}

function escapeStringLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

export async function parseOAS(filePath: string): Promise<OpenAPIV3.Document> {
  try {
    const SwaggerParser = await import("@apidevtools/swagger-parser");
    const api = (await SwaggerParser.default.bundle(filePath)) as OpenAPIV3.Document;
    return api;
  } catch (error) {
    console.error("Error parsing OAS file:", error);
    throw error;
  }
}

export function extractBodySchemas(
  operations: OperationInfo[],
  existingSchemaNames?: Set<string>
): ZodSchemaInfo[] {
  const bodySchemas: ZodSchemaInfo[] = [];
  for (const op of operations) {
    if (op.requestBody) {
      const zodCode = op.requestBody.zodCode;
      // If the body is already a reference to an existing named schema,
      // skip creating a redundant _Body alias.
      if (existingSchemaNames && isIdentifier(zodCode) && existingSchemaNames.has(zodCode)) {
        continue;
      }
      bodySchemas.push({
        name: sanitizeIdentifier(`${op.operationId}_Body`),
        schema: z.any(),
        zodCode,
      });
    }
  }
  return bodySchemas;
}

export async function generateClient(oas: OpenAPIV3.Document): Promise<string> {
  const schemas = generateZodSchemas(oas);
  const operations = generateOperations(oas);
  const schemaNames = new Set(schemas.map((s) => s.name));
  const allSchemas = [...schemas, ...extractBodySchemas(operations, schemaNames)];
  const schemaCode = generateSchemaCode(allSchemas);
  const schemasObjectCode = generateSchemasObject(allSchemas);
  const operationsCode = generateOperationsCode(operations, schemaNames);
  const code = `import { z } from 'zod';
import { createClient as createRuntimeClient, type ClientOptions } from '@pixxiti/oax-core';

${schemaCode}

${schemasObjectCode}

${operationsCode}

export function createClient(baseUrl: string, options?: ClientOptions) {
  return createRuntimeClient(baseUrl, operations, options);
}
`;

  return prettierFormat(code, { parser: "typescript" });
}

interface ZodSchemaInfo {
  name: string;
  schema: ZodType;
  zodCode: string;
}

export function generateSchemaCode(schemas: ZodSchemaInfo[]): string {
  return schemas.map(({ name, zodCode }) => `export const ${name} = ${zodCode};`).join("\n\n");
}

export function generateSchemasObject(schemas: ZodSchemaInfo[]): string {
  if (schemas.length === 0) return "";
  const entries = schemas.map(({ name }) => `  ${name},`).join("\n");
  return `export const schemas = {\n${entries}\n};`;
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

/**
 * Resolve a $ref pointer against the OAS document.
 * Supports JSON Pointer paths like "#/components/parameters/foo".
 */
function resolveRef(oas: OpenAPIV3.Document, ref: string): any {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let current: any = oas;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Resolve a parameter that may be a $ref or an inline object.
 */
function resolveParameter(
  oas: OpenAPIV3.Document,
  param: OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject
): OpenAPIV3.ParameterObject | undefined {
  if ("$ref" in param) {
    return resolveRef(oas, param.$ref) as OpenAPIV3.ParameterObject | undefined;
  }
  return param as OpenAPIV3.ParameterObject;
}

/**
 * Resolve a response that may be a $ref or an inline object.
 */
function resolveResponse(
  oas: OpenAPIV3.Document,
  response: OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject
): OpenAPIV3.ResponseObject | undefined {
  if ("$ref" in response) {
    return resolveRef(oas, (response as OpenAPIV3.ReferenceObject).$ref) as
      | OpenAPIV3.ResponseObject
      | undefined;
  }
  return response as OpenAPIV3.ResponseObject;
}

export function generateOperations(oas: OpenAPIV3.Document): OperationInfo[] {
  const operations: OperationInfo[] = [];

  if (!oas.paths) return operations;

  for (const [pathTemplate, pathItem] of Object.entries(oas.paths)) {
    if (!pathItem) continue;

    // Collect path-level parameters (inherited by all operations under this path)
    const pathLevelParams: OpenAPIV3.ParameterObject[] = [];
    if ((pathItem as any).parameters) {
      for (const p of (pathItem as any).parameters) {
        const resolved = resolveParameter(oas, p);
        if (resolved) pathLevelParams.push(resolved);
      }
    }

    const methods = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

    for (const method of methods) {
      const operation = (pathItem as any)[method] as OpenAPIV3.OperationObject;
      if (!operation) continue;

      const operationId =
        operation.operationId || `${method}${pathTemplate.replace(/[^a-zA-Z0-9]/g, "")}`;

      // Merge path-level + operation-level parameters.
      // Operation-level params override path-level params with the same name+in.
      const opParams: OpenAPIV3.ParameterObject[] = [];
      if (operation.parameters) {
        for (const param of operation.parameters) {
          const resolved = resolveParameter(oas, param);
          if (resolved) opParams.push(resolved);
        }
      }

      // Build a set of (name, in) from operation-level params for dedup
      const opParamKeys = new Set(opParams.map((p) => `${p.name}:${p.in}`));
      const mergedParams = [
        ...pathLevelParams.filter((p) => !opParamKeys.has(`${p.name}:${p.in}`)),
        ...opParams,
      ];

      const parameters: ParameterInfo[] = mergedParams.map((paramObj) => ({
        name: paramObj.name,
        in: paramObj.in as ParameterInfo["in"],
        required: paramObj.required || false,
        schema: {
          zodCode: generateZodCodeFromSchema(paramObj.schema),
          required: paramObj.required || false,
        },
      }));

      let requestBody: SchemaReference | undefined;
      if (operation.requestBody) {
        let resolvedBody: OpenAPIV3.RequestBodyObject | undefined;
        if ("$ref" in operation.requestBody) {
          const resolved = resolveRef(
            oas,
            (operation.requestBody as OpenAPIV3.ReferenceObject).$ref
          );
          if (resolved) resolvedBody = resolved as OpenAPIV3.RequestBodyObject;
        } else {
          resolvedBody = operation.requestBody;
        }
        if (resolvedBody) {
          const content = resolvedBody.content?.["application/json"];
          if (content?.schema) {
            requestBody = {
              zodCode: generateZodCodeFromSchema(content.schema),
              required: resolvedBody.required || false,
            };
          }
        }
      }

      const responses: ResponseInfo[] = [];
      if (operation.responses) {
        for (const [status, response] of Object.entries(operation.responses)) {
          if (!response) continue;

          const responseObj = resolveResponse(oas, response);
          if (!responseObj) continue;

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

export function generateOperationsCode(
  operations: OperationInfo[],
  existingSchemaNames?: Set<string>
): string {
  const operationObjects = operations
    .map((op) => {
      // Group parameters by type
      const pathParams = op.parameters.filter((p) => p.in === "path");
      const queryParams = op.parameters.filter((p) => p.in === "query");
      const headerParams = op.parameters.filter((p) => p.in === "header");

      // Generate parameter objects for each type
      const generateParamObject = (params: ParameterInfo[]) => {
        if (params.length === 0) return null;

        const properties = params
          .map((p) => `${p.name}: ${p.schema.zodCode}${p.required ? "" : ".optional()"}`)
          .join(", ");

        return `z.object({ ${properties} })`;
      };

      const pathParamsCode = generateParamObject(pathParams);
      const queryParamsCode = generateParamObject(queryParams);
      const headerParamsCode = generateParamObject(headerParams);

      let bodySchemaRef = "";
      if (op.requestBody) {
        const zodCode = op.requestBody.zodCode;
        // Use the original schema name if it's already a named schema ref;
        // otherwise fall back to the generated _Body name.
        bodySchemaRef =
          existingSchemaNames && isIdentifier(zodCode) && existingSchemaNames.has(zodCode)
            ? zodCode
            : sanitizeIdentifier(`${op.operationId}_Body`);
      }
      const requestBodyCode = op.requestBody
        ? `requestBody: { schema: ${bodySchemaRef}, required: ${op.requestBody.required} },`
        : "";

      const responsesCode = op.responses
        .map(
          (r) => `
    '${r.status}': {
      description: ${r.description ? `"${escapeStringLiteral(r.description)}"` : "undefined"},
      schema: ${r.schema ? r.schema.zodCode : "z.void()"}
    }`
        )
        .join(",");

      // Find success response (first 2xx) for convenience `response` field
      const successResponse = op.responses.find((r) => r.status.startsWith("2"));
      const responseCode = successResponse?.schema ? successResponse.schema.zodCode : "z.void()";

      return `
  '${op.operationId}': {
    method: '${op.method}',
    path: '${op.path}',
    operationId: '${op.operationId}',
    summary: ${op.summary ? `"${escapeStringLiteral(op.summary)}"` : "undefined"},
    description: ${op.description ? `"${escapeStringLiteral(op.description)}"` : "undefined"},
    ${pathParamsCode ? `params: ${pathParamsCode},` : ""}
    ${queryParamsCode ? `queries: ${queryParamsCode},` : ""}
    ${headerParamsCode ? `headers: ${headerParamsCode},` : ""}
    ${requestBodyCode}
    response: ${responseCode},
    responses: {${responsesCode}
    }
  }`;
    })
    .join(",");

  return `export const operations = {${operationObjects}
} as const;

export type Operations = typeof operations;`;
}

export function generateZodSchemas(oas: OpenAPIV3.Document): ZodSchemaInfo[] {
  const schemas: ZodSchemaInfo[] = [];

  if (!oas.components?.schemas) return schemas;

  for (const [name, schema] of Object.entries(oas.components.schemas)) {
    if (!schema || typeof schema !== "object" || "$ref" in schema) continue;

    const zodCode = generateZodCodeFromSchema(schema as OpenAPIV3.SchemaObject);

    schemas.push({
      name: sanitizeIdentifier(name),
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
    return refName ? sanitizeIdentifier(refName) : "z.any()";
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
    // Escape forward slashes for JavaScript regex literal
    const escapedPattern = schema.pattern.replace(/\//g, "\\/");
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
