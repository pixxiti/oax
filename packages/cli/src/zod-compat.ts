import { sanitizeIdentifier } from "./generator";

export interface ZodCodegenOptions {
  zodVersion?: 3 | 4;
  strictObjects?: boolean;
  additionalPropsDefault?: boolean;
  schemaDefaults?: Map<string, unknown>;
  mediaTypeExpr?: string;
}

export function toCamelCase(name: string): string {
  return name.replace(/[-_]([a-zA-Z])/g, (_, char: string) => char.toUpperCase());
}

export function generateZodCode(schema: any, options?: ZodCodegenOptions): string {
  const version = options?.zodVersion ?? 4;
  if (!schema) return "z.any()";

  if ("$ref" in schema) {
    const refName = schema.$ref.split("/").pop();
    return refName ? sanitizeIdentifier(refName) : "z.any()";
  }

  let result: string;

  if (schema.allOf) {
    const schemas = schema.allOf.map((s: any) => generateZodCode(s, options));
    result =
      schemas.length === 1
        ? schemas[0]
        : schemas.reduce((acc: string, curr: string) => `z.intersection(${acc}, ${curr})`);
  } else if (schema.anyOf) {
    const schemas = schema.anyOf.map((s: any) => generateZodCode(s, options));
    result = `z.union([${schemas.join(", ")}])`;
  } else if (schema.oneOf) {
    const schemas = schema.oneOf.map((s: any) => generateZodCode(s, options));
    result = schema.discriminator
      ? `z.discriminatedUnion("${schema.discriminator.propertyName}", [${schemas.join(", ")}])`
      : `z.union([${schemas.join(", ")}])`;
  } else {
    result = generateBaseSchema(schema, version, options);
  }

  if (schema.nullable === true) {
    result = `${result}.nullable()`;
  }
  return result;
}

function generateBaseSchema(schema: any, version: number, options?: ZodCodegenOptions): string {
  const type = schema.type ?? (schema.properties ? "object" : undefined);
  switch (type) {
    case "string":
      return generateStringSchema(schema, version, options);
    case "number":
      return generateNumberSchema(schema);
    case "integer":
      return generateIntegerSchema(schema);
    case "boolean":
      return "z.boolean()";
    case "array":
      return generateArraySchema(schema, options);
    case "object":
      return generateObjectSchema(schema, options);
    default:
      return "z.any()";
  }
}

function generateStringSchema(schema: any, version: number, _options?: ZodCodegenOptions): string {
  let zodSchema = "z.string()";

  if (schema.enum) {
    return `z.enum([${schema.enum.map((v: string) => `'${v}'`).join(", ")}])`;
  }

  if (schema.format) {
    switch (schema.format) {
      case "date-time":
        if (version === 3) return "z.string().datetime({ offset: true })";
        return "z.iso.datetime()";
      case "date":
        zodSchema += ".date()";
        break;
      case "time":
        zodSchema += ".time()";
        break;
      case "email":
        if (version === 3) return "z.string().email()";
        return "z.email()";
      case "uri":
      case "url":
        if (version === 3) return "z.string().url()";
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
        break;
    }
  }

  if (schema.minLength !== undefined) zodSchema += `.min(${schema.minLength})`;
  if (schema.maxLength !== undefined) zodSchema += `.max(${schema.maxLength})`;
  if (schema.pattern) {
    const escapedPattern = schema.pattern.replace(/\//g, "\\/");
    zodSchema += `.regex(/${escapedPattern}/)`;
  }

  return zodSchema;
}

function generateNumberSchema(schema: any): string {
  let zodSchema = "z.number()";
  if (schema.minimum !== undefined) {
    zodSchema += schema.exclusiveMinimum === true ? `.gt(${schema.minimum})` : `.gte(${schema.minimum})`;
  }
  if (schema.exclusiveMinimum !== undefined && typeof schema.exclusiveMinimum === "number") {
    zodSchema += `.gt(${schema.exclusiveMinimum})`;
  }
  if (schema.maximum !== undefined) {
    zodSchema += schema.exclusiveMaximum === true ? `.lt(${schema.maximum})` : `.lte(${schema.maximum})`;
  }
  if (schema.exclusiveMaximum !== undefined && typeof schema.exclusiveMaximum === "number") {
    zodSchema += `.lt(${schema.exclusiveMaximum})`;
  }
  if (schema.multipleOf !== undefined) zodSchema += `.multipleOf(${schema.multipleOf})`;
  return zodSchema;
}

function generateIntegerSchema(schema: any): string {
  let zodSchema = "z.number().int()";
  if (schema.minimum !== undefined) {
    zodSchema += schema.exclusiveMinimum === true ? `.gt(${schema.minimum})` : `.gte(${schema.minimum})`;
  }
  if (schema.exclusiveMinimum !== undefined && typeof schema.exclusiveMinimum === "number") {
    zodSchema += `.gt(${schema.exclusiveMinimum})`;
  }
  if (schema.maximum !== undefined) {
    zodSchema += schema.exclusiveMaximum === true ? `.lt(${schema.maximum})` : `.lte(${schema.maximum})`;
  }
  if (schema.exclusiveMaximum !== undefined && typeof schema.exclusiveMaximum === "number") {
    zodSchema += `.lt(${schema.exclusiveMaximum})`;
  }
  if (schema.multipleOf !== undefined) zodSchema += `.multipleOf(${schema.multipleOf})`;
  return zodSchema;
}

function generateArraySchema(schema: any, options?: ZodCodegenOptions): string {
  let itemSchema = "z.any()";
  if (schema.items) itemSchema = generateZodCode(schema.items, options);
  let zodSchema = `z.array(${itemSchema})`;
  if (schema.minItems !== undefined) zodSchema += `.min(${schema.minItems})`;
  if (schema.maxItems !== undefined) zodSchema += `.max(${schema.maxItems})`;
  if (schema.uniqueItems === true) {
    zodSchema = `${zodSchema}.refine((items) => new Set(items).size === items.length, { message: "Items must be unique" })`;
  }
  return zodSchema;
}

function generateObjectSchema(schema: any, options?: ZodCodegenOptions): string {
  if (!schema.properties) {
    if (schema.additionalProperties === false) return "z.object({}).strict()";
    if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
      return "z.record(z.string(), z.any())";
    }
    if (typeof schema.additionalProperties === "object") {
      const valueSchema = generateZodCode(schema.additionalProperties, options);
      return `z.record(z.string(), ${valueSchema})`;
    }
    return "z.record(z.string(), z.any())";
  }

  const properties = Object.entries(schema.properties)
    .map(([name, prop]: [string, any]) => {
      const isRequired = schema.required?.includes(name) || false;
      const zodCode = generateZodCode(prop, options);

      let defaultValue = prop.default;
      if (defaultValue === undefined && prop.$ref && options?.schemaDefaults) {
        const refName = prop.$ref.split("/").pop();
        if (refName) defaultValue = options.schemaDefaults.get(sanitizeIdentifier(refName));
      }

      const defaultSuffix =
        defaultValue !== undefined ? `.default(${JSON.stringify(defaultValue)})` : "";
      const optionalSuffix = isRequired || defaultSuffix ? "" : ".optional()";

      if (prop.deprecated === true) {
        return `${name}: ${zodCode}${defaultSuffix}${optionalSuffix} /* @deprecated */`;
      }
      return `${name}: ${zodCode}${defaultSuffix}${optionalSuffix}`;
    })
    .join(", ");

  let zodSchema = `z.object({ ${properties} })`;

  if (options?.strictObjects) {
    zodSchema += ".strict()";
  } else if (schema.additionalProperties === false) {
    zodSchema += ".strict()";
  } else if (schema.additionalProperties === true) {
    zodSchema += ".passthrough()";
  } else if (typeof schema.additionalProperties === "object") {
    zodSchema += ".passthrough() /* additional properties allowed */";
  } else if (schema.additionalProperties === undefined && options?.additionalPropsDefault === true) {
    zodSchema += ".passthrough()";
  }

  return zodSchema;
}
