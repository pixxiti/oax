import type { OpenAPIV3 } from "openapi-types";
import { z, type ZodSchema } from "zod";
import prettier from "prettier";

export async function parseOAS(filePath: string): Promise<OpenAPIV3.Document> {
  try {
    const SwaggerParser = await import("@apidevtools/swagger-parser");
    const api = (await SwaggerParser.default.validate(
      filePath
    )) as OpenAPIV3.Document;
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
import { createClient as createRuntimeClient } from '@zoddy/core';

${schemaCode}

${operationsCode}

export function createClient(baseUrl: string, options?: { headers?: Record<string, string> }) {
  return createRuntimeClient(baseUrl, operations, options);
}

export { schemas, operations };`;

  return prettier.format(code, { parser: "typescript" });
}

interface ZodSchemaInfo {
  name: string;
  schema: ZodSchema;
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

    const methods = [
      "get",
      "post",
      "put",
      "delete",
      "patch",
      "head",
      "options",
    ] as const;

    for (const method of methods) {
      const operation = (pathItem as any)[method] as OpenAPIV3.OperationObject;
      if (!operation) continue;

      const operationId =
        operation.operationId ||
        `${method}${pathTemplate.replace(/[^a-zA-Z0-9]/g, "")}`;

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
      if (operation.description)
        operationInfo.description = operation.description;

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
      const parametersCode = op.parameters
        .map(
          (p) => `
    {
      name: '${p.name}',
      in: '${p.in}',
      required: ${p.required},
      schema: ${p.schema.zodCode}
    }`
        )
        .join(",");

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
    parameters: [${parametersCode}
    ],
    ${requestBodyCode}
    responses: {${responsesCode}
    }
  }`;
    })
    .join(",");

  return `export const operations = {${operationObjects}
};

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

  if ("$ref" in schema) {
    const refName = schema.$ref.split("/").pop();
    return refName || "z.any()";
  }

  switch (schema.type) {
    case "string":
      if (schema.enum) {
        return `z.enum([${schema.enum.map((v: string) => `'${v}'`).join(", ")}])`;
      }
      if (schema.format === "date-time") {
        return "z.string().datetime()";
      }
      return "z.string()";

    case "number":
      return "z.number()";

    case "integer":
      return "z.number().int()";

    case "boolean":
      return "z.boolean()";

    case "array":
      if (schema.items) {
        return `z.array(${generateZodCodeFromSchema(schema.items)})`;
      }
      return "z.array(z.any())";

    case "object":
      if (schema.properties) {
        const properties = Object.entries(schema.properties)
          .map(([name, prop]: [string, any]) => {
            const isRequired = schema.required?.includes(name) || false;
            const zodCode = generateZodCodeFromSchema(prop);
            return `${name}: ${zodCode}${isRequired ? "" : ".optional()"}`;
          })
          .join(", ");
        return `z.object({ ${properties} })`;
      }
      return "z.record(z.any())";

    default:
      return "z.any()";
  }
}
