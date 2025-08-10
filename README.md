# Zoddy

**ky + oas + zod = typesafe api clients**

Zoddy is a TypeScript-first API client generator that creates fully type-safe HTTP clients with runtime validation using Zod schemas. It combines the power of OpenAPI specifications, Zod validation, and the ky HTTP client for a seamless development experience.

## Features

- 🚀 **Type-safe API clients** generated from OpenAPI specifications
- ✅ **Runtime validation** of requests and responses using Zod schemas
- 🛡️ **Automatic input/output validation** with developer-friendly error messages
- 🔧 **Validation control** - enable/disable validation as needed
- 🎯 **Zero configuration** - validation works out of the box
- 📦 **Built on ky** - modern, lightweight HTTP client
- 🔄 **Backwards compatible** - existing code continues to work

## Quick Start

### Installation

```bash
npm install @zoddy/core
# or
pnpm add @zoddy/core
# or
yarn add @zoddy/core
```

### Basic Usage

Generate your API client (validation enabled by default):

```typescript
import { createClient } from './generated-client';

const client = createClient('https://api.example.com');

// All requests and responses are automatically validated
const response = await client.getPet({ petId: 123 });
```

### Disable Validation

```typescript
const client = createClient('https://api.example.com', {
  validate: false // Turns off all validation
});
```

## Validation Features

### Automatic Input/Output Validation

- **Request Parameters**: Validates path, query, and header parameters against their Zod schemas
- **Request Body**: Validates request body data against Zod schemas
- **Response Data**: Validates API response data against expected Zod schemas

### Validation Control

- **Default Behavior**: Validation is **enabled by default**
- **Opt-out**: Pass `validate: false` to disable validation
- **Custom Hooks**: Export validation helpers for custom ky hook configuration

### Developer-Friendly Error Messages

- Console-readable error format with emojis and detailed context
- Shows validation path and specific error messages
- Includes the actual data that failed validation

## Advanced Usage

### Custom Validation Hooks

```typescript
import { 
  createValidationHelpers, 
  createKyValidationHooks, 
  ValidationError 
} from '@zoddy/core';
import { createClient } from './generated-client';

const helpers = createValidationHelpers();
const hooks = createKyValidationHooks(helpers);

// Extend existing client with custom hooks
const client = createClient('https://api.example.com', {
  validate: false // Turns off all validation
});
const customClient = client.extend({
  hooks: {
    beforeRequest: [hooks.beforeRequest],
    afterResponse: [hooks.afterResponse]
  }
});
```

## Error Handling

### ValidationError Class

When validation fails, a `ValidationError` is thrown with:

- `type`: "request" or "response" 
- `operation`: The operation ID that failed
- `zodError`: The underlying Zod validation error
- `data`: The actual data that failed validation

### Console Output Example

```
🚫 Request validation error in operation: createPet

Validation errors:
  • name: Required
  • age: Expected number, received string

Data received: {
  "name": "",
  "age": "invalid"
}
```

## Implementation Details

### Validation Flow

1. **Request Validation**: Before sending the request
   - Validates parameters against their schemas
   - Validates request body against schema
   - Throws `ValidationError` if validation fails

2. **Response Validation**: After receiving the response  
   - Validates response data against expected schema
   - Logs errors to console for debugging
   - Returns validated data

### Performance

- Validation only runs when `validate: true` (default)
- Uses Zod's efficient `safeParse` method
- Minimal overhead when validation is disabled

## API Reference

### Exported Functions

- `createValidationHelpers()`: Creates validation helper functions
- `createKyValidationHooks(helpers)`: Creates ky hooks for validation
- `ValidationError`: Error class for validation failures
- `ValidationHelpers`: Interface for validation helper functions
- `KyValidationHooks`: Interface for ky validation hooks

## Examples

Check out the [basic example](./examples/basic/) for a complete working implementation using the Petstore API.

## Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended package manager)

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development mode
pnpm dev
```

### Project Structure

- `packages/core/` - Core Zoddy runtime library
- `examples/basic/` - Basic usage example with Petstore API

## Backwards Compatibility

All existing code continues to work without changes. Validation is additive and doesn't break existing functionality.

## License

ISC
