# 🐾 Zoddy Petstore Example

This example demonstrates how to use Zoddy to generate fully type-safe API clients from OpenAPI specifications. We'll be using the famous [Petstore API](https://petstore.swagger.io/) to showcase the power of automatic code generation and TypeScript type safety.

## What This Example Shows

- ✅ **Type-Safe API Calls**: Generated client methods with full TypeScript support
- ✅ **Parameter Validation**: TypeScript ensures you pass the correct parameters
- ✅ **Response Type Safety**: Know exactly what data you'll receive back
- ✅ **Runtime Error Handling**: Proper error handling with typed responses
- ✅ **Developer Experience**: IntelliSense, autocomplete, and compile-time checks

## Quick Start

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Start the Development Server**
   ```bash
   pnpm run dev
   ```

3. **Open Your Browser**
   Navigate to the localhost URL shown in your terminal (typically http://localhost:5173)

## Development Scripts

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run lint` - Lint code with Biome
- `pnpm run format` - Format code with Biome
- `pnpm run check` - Run Biome checks (lint + format)
- `pnpm run typecheck` - Type check with TypeScript

## How It Works

### 1. Client Generation

The API client is generated from the Petstore OpenAPI spec:

```bash
# This command was used to generate the client
node ../../packages/cli/dist/index.js generate \
  -i https://petstore.swagger.io/v2/swagger.json \
  -o src/api/client.ts
```

This creates a fully typed client in `src/api/client.ts` with:
- Type-safe operation methods
- Parameter validation schemas
- Response type definitions
- Full IntelliSense support

### 2. Client Usage

```typescript
import { createClient } from "@zoddy/core";
import { operations } from "./api/client";

// Create typed client - TypeScript knows all available methods!
const client = createClient("https://petstore.swagger.io/v2", operations);

// Type-safe API calls
const pet = await client.getPetById({ petId: 1 });
//    ^-- TypeScript knows the exact shape of this response

// TypeScript will catch errors at compile time:
// await client.getPetById({ wrongParam: 1 }); // ❌ Compile error!
// await client.getPetById(); // ❌ Missing required parameter!
```

### 3. Type Safety in Action

The generated client provides several levels of type safety:

#### Parameter Type Safety
```typescript
// ✅ Correct usage - TypeScript is happy
await client.getPetById({ petId: 123 });

// ❌ Wrong parameter name - TypeScript error
await client.getPetById({ id: 123 });

// ❌ Wrong parameter type - TypeScript error  
await client.getPetById({ petId: "not-a-number" });

// ❌ Missing required parameter - TypeScript error
await client.getPetById();
```

#### Response Type Safety
```typescript
const pet = await client.getPetById({ petId: 1 });

// ✅ TypeScript knows these properties exist
console.log(pet.name);
console.log(pet.status); // "available" | "pending" | "sold"
console.log(pet.category?.name);

// ❌ TypeScript prevents accessing non-existent properties
console.log(pet.nonExistentProperty); // Compile error!
```

#### IntelliSense & Autocomplete
Your IDE will provide:
- Method suggestions as you type
- Parameter hints and validation
- Return type information
- Documentation from the OpenAPI spec

## Project Structure

```
examples/basic/
├── src/
│   ├── api/
│   │   └── client.ts          # Generated API client
│   ├── App.tsx                # Main React component with API integration
│   ├── App.css                # Styling
│   └── main.tsx               # React app entry point
├── package.json               # Project dependencies
└── README.md                  # This file
```

## Key Features Demonstrated

### Real API Integration
- Makes actual HTTP requests to petstore.swagger.io
- Handles loading states and errors
- Demonstrates CORS-enabled API calls

### TypeScript Benefits
- **Compile-time safety**: Catch errors before runtime
- **IntelliSense**: Full autocomplete for API methods and data
- **Refactoring safety**: Change detection across your codebase
- **Documentation**: Method signatures serve as living documentation

### Developer Experience
- **Zero configuration**: Works out of the box
- **Fast feedback**: Immediate error detection in your IDE  
- **Predictable**: Generated code follows consistent patterns
- **Maintainable**: Easy to update when the API changes

## Advanced Usage

### Error Handling
```typescript
try {
  const pet = await client.getPetById({ petId: 999999 });
  setPet(pet);
} catch (error) {
  // Handle API errors (404, 500, network issues, etc.)
  setError(error.message);
}
```

### Custom Headers & Configuration
```typescript
const client = createClient(
  "https://petstore.swagger.io/v2",
  operations,
  {
    headers: {
      'Authorization': 'Bearer your-token',
      'X-Custom-Header': 'value'
    }
  }
);
```

## Regenerating the Client

If the API changes, simply regenerate the client:

```bash
# Update the generated client
node ../../packages/cli/dist/index.js generate \
  -i https://petstore.swagger.io/v2/swagger.json \
  -o src/api/client.ts

# TypeScript will immediately show you what changed!
```

## Next Steps

Try modifying this example to:
- Add more API operations (create pet, update pet, etc.)
- Implement form validation using the generated schemas
- Add request/response interceptors
- Handle different response formats
- Integrate with your favorite state management library

## Learn More

- [Zoddy Documentation](../../README.md)
- [OpenAPI Specification](https://swagger.io/specification/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Petstore API Documentation](https://petstore.swagger.io/)

---

**Happy coding with type safety!** 🎉
