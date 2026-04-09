/**
 * Programmatic API for @oax/cli.
 *
 * Usage:
 *   import { parseOAS, generateSchemasFile } from "@oax/cli/lib";
 *
 *   const oas = await parseOAS("path/to/openapi.yaml");
 *   const code = await generateSchemasFile(oas, { zodVersion: 3 });
 */
export { parseOAS } from "./generator";
export type { ZodCodegenOptions as GenerateOptions } from "./zod-compat";

import type { OpenAPIV3 } from "openapi-types";
import { format as prettierFormat } from "prettier";
import { z } from "zod";

import {
  sanitizeIdentifier,
  extractBodySchemas,
  generateSchemaCode,
  generateSchemasObject,
  generateOperationsCode,
} from "./generator";

import { generateZodCode, type ZodCodegenOptions } from "./zod-compat";

// ─── Internal types (mirrored from generator.ts) ────────────────────────────

interface ZodSchemaInfo {
  name: string;
  schema: z.ZodType;
  zodCode: string;
}

interface SchemaReference {
  zodCode: string;
  required: boolean;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveRef(oas: OpenAPIV3.Document, ref: string): any {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let current: any = oas;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function resolveParameter(
  oas: OpenAPIV3.Document,
  param: OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject
): OpenAPIV3.ParameterObject | undefined {
  if ("$ref" in param) return resolveRef(oas, param.$ref);
  return param as OpenAPIV3.ParameterObject;
}

function resolveResponse(
  oas: OpenAPIV3.Document,
  response: OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject
): OpenAPIV3.ResponseObject | undefined {
  if ("$ref" in response) return resolveRef(oas, (response as OpenAPIV3.ReferenceObject).$ref);
  return response as OpenAPIV3.ResponseObject;
}

function escapeStringLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function collectSchemaDefaults(oas: OpenAPIV3.Document): Map<string, unknown> {
  const defaults = new Map<string, unknown>();
  if (!oas.components?.schemas) return defaults;
  for (const [name, schema] of Object.entries(oas.components.schemas)) {
    if (
      schema &&
      typeof schema === "object" &&
      !("$ref" in schema) &&
      (schema as any).default !== undefined
    ) {
      defaults.set(sanitizeIdentifier(name), (schema as any).default);
    }
  }
  return defaults;
}

function matchesMediaType(mediaType: string, expr?: string): boolean {
  if (!expr) return mediaType.includes("json");
  // Simple evaluation - covers the common case `mediaType.includes("json")`
  try {
    return new Function("mediaType", `return ${expr}`)(mediaType) as boolean;
  } catch {
    return mediaType.includes("json");
  }
}

// ─── Schema & operation generation using zod-compat ─────────────────────────

function generateZodSchemas(oas: OpenAPIV3.Document, options: ZodCodegenOptions): ZodSchemaInfo[] {
  const schemas: ZodSchemaInfo[] = [];
  if (!oas.components?.schemas) return schemas;

  // Topological sort: collect dependencies, then emit in order
  const schemaEntries = Object.entries(oas.components.schemas).filter(
    ([, s]) => s && typeof s === "object" && !("$ref" in s)
  );

  const nameToIndex = new Map(schemaEntries.map(([name], i) => [name, i]));

  // Collect refs for each schema to build dependency graph
  function collectLocalRefs(obj: any): Set<string> {
    const refs = new Set<string>();
    function walk(node: any) {
      if (node == null) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node === "object") {
        if (typeof node.$ref === "string") {
          const refName = node.$ref.split("/").pop();
          if (refName && nameToIndex.has(refName)) refs.add(refName);
        }
        for (const val of Object.values(node)) walk(val);
      }
    }
    walk(obj);
    return refs;
  }

  // Kahn's algorithm for topological sort
  const deps = schemaEntries.map(([, schema]) => collectLocalRefs(schema));
  const inDegree = new Array<number>(schemaEntries.length).fill(0);
  const adjList: number[][] = schemaEntries.map(() => [] as number[]);

  for (let i = 0; i < schemaEntries.length; i++) {
    const d = deps[i];
    if (!d) continue;
    for (const dep of d) {
      const j = nameToIndex.get(dep);
      if (j !== undefined && j !== i) {
        adjList[j]?.push(i);
        (inDegree[i] as number)++;
      }
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < inDegree.length; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const sorted: number[] = [];
  while (queue.length > 0) {
    const i = queue.shift() as number;
    sorted.push(i);
    for (const j of adjList[i] ?? []) {
      (inDegree[j] as number)--;
      if (inDegree[j] === 0) queue.push(j);
    }
  }
  // Add any remaining (circular refs) in original order
  if (sorted.length < schemaEntries.length) {
    for (let i = 0; i < schemaEntries.length; i++) {
      if (!sorted.includes(i)) sorted.push(i);
    }
  }

  for (const i of sorted) {
    const entry = schemaEntries[i];
    if (!entry) continue;
    const [name, schema] = entry;
    const zodCode = generateZodCode(schema as OpenAPIV3.SchemaObject, options);
    schemas.push({ name: sanitizeIdentifier(name), schema: z.any(), zodCode });
  }

  return schemas;
}

function generateOperations(oas: OpenAPIV3.Document, options: ZodCodegenOptions): OperationInfo[] {
  const operations: OperationInfo[] = [];
  if (!oas.paths) return operations;

  for (const [pathTemplate, pathItem] of Object.entries(oas.paths)) {
    if (!pathItem) continue;

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

      const opParams: OpenAPIV3.ParameterObject[] = [];
      if (operation.parameters) {
        for (const param of operation.parameters) {
          const resolved = resolveParameter(oas, param);
          if (resolved) opParams.push(resolved);
        }
      }

      const opParamKeys = new Set(opParams.map((p) => `${p.name}:${p.in}`));
      const mergedParams = [
        ...pathLevelParams.filter((p) => !opParamKeys.has(`${p.name}:${p.in}`)),
        ...opParams,
      ];

      const parameters: ParameterInfo[] = mergedParams.map((p) => ({
        name: p.name,
        in: p.in as ParameterInfo["in"],
        required: p.required || false,
        schema: { zodCode: generateZodCode(p.schema, options), required: p.required || false },
      }));

      let requestBody: SchemaReference | undefined;
      if (operation.requestBody) {
        let resolvedBody: OpenAPIV3.RequestBodyObject | undefined;
        if ("$ref" in operation.requestBody) {
          resolvedBody = resolveRef(oas, (operation.requestBody as OpenAPIV3.ReferenceObject).$ref);
        } else {
          resolvedBody = operation.requestBody;
        }
        if (resolvedBody?.content) {
          const entry = Object.entries(resolvedBody.content).find(([mt]) =>
            matchesMediaType(mt, options.mediaTypeExpr)
          );
          if (entry?.[1]?.schema) {
            requestBody = {
              zodCode: generateZodCode(entry[1].schema, options),
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

          const responseInfo: ResponseInfo = { status };
          if (responseObj.description) responseInfo.description = responseObj.description;

          if (responseObj.content) {
            const entry = Object.entries(responseObj.content).find(([mt]) =>
              matchesMediaType(mt, options.mediaTypeExpr)
            );
            if (entry?.[1]?.schema) {
              responseInfo.schema = {
                zodCode: generateZodCode(entry[1].schema, options),
                required: true,
              };
            }
          }

          responses.push(responseInfo);
        }
      }

      const opInfo: OperationInfo = {
        operationId,
        method,
        path: pathTemplate,
        parameters,
        responses,
      };
      if (operation.summary) opInfo.summary = operation.summary;
      if (operation.description) opInfo.description = operation.description;
      if (requestBody) opInfo.requestBody = requestBody;

      operations.push(opInfo);
    }
  }

  return operations;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate the full content of a `schemas.ts` / `zod-client.ts` file
 * from a parsed OpenAPI document.
 */
export async function generateSchemasFile(
  oas: OpenAPIV3.Document,
  options?: ZodCodegenOptions
): Promise<string> {
  const opts: ZodCodegenOptions = {
    ...options,
    schemaDefaults: collectSchemaDefaults(oas),
  };

  const schemas = generateZodSchemas(oas, opts);
  const operations = generateOperations(oas, opts);
  const schemaNames = new Set(schemas.map((s) => s.name));
  const allSchemas = [...schemas, ...extractBodySchemas(operations, schemaNames)];

  const schemaCode = generateSchemaCode(allSchemas);
  const schemasObjectCode = generateSchemasObject(allSchemas);
  const operationsCode = generateOperationsCode(operations, schemaNames);

  const fullCode = `import { z } from 'zod';

${schemaCode}

${schemasObjectCode}

${operationsCode}`;

  return prettierFormat(fullCode, { parser: "typescript" });
}
