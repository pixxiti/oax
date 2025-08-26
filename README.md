# OAX

**Open API Spec validation and client generation tooling for Typescript**

OAX is a TypeScript-first API client generator that creates fully type-safe HTTP clients with runtime validation using Zod schemas. It combines the power of OpenAPI specifications, Zod validation, and the ky HTTP client for a seamless development experience.

## Features

- 🚀 **Type-safe API clients** generated from OpenAPI specifications
- ✅ **Runtime validation** of requests and responses using Zod schemas
- 🛡️ **Automatic input/output validation** with developer-friendly error messages
- 🔧 **Validation control** - enable/disable validation as needed
- 🎯 **Zero configuration** - validation works out of the box
- 📦 **Built on ky** - modern, lightweight HTTP client
- 🔄 **Backwards compatible** - existing code continues to work

## Quick Start

### Packages

OAX consists of three main packages:

- **[@oax/core](./packages/core/)** - Core runtime library for API clients with validation
- **[@oax/cli](./packages/cli/)** - Command-line tool for generating typed API clients from OpenAPI specs
- **[@oax/hooks](./packages/hooks/)** - React Query v5 hooks for seamless React integration

## Installation

```bash
# Core runtime library
npm install @oax/core

# CLI for code generation
npm install -g @oax/cli

# React hooks (requires React 18+ and TanStack Query v5)
npm install @oax/hooks @tanstack/react-query
```

### Package Manager Alternatives

```bash
# Using pnpm
pnpm add @oax/core
pnpm add -g @oax/cli
pnpm add @oax/hooks @tanstack/react-query

# Using yarn
yarn add @oax/core
yarn global add @oax/cli
yarn add @oax/hooks @tanstack/react-query
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
} from '@oax/core';
import { createClient } from './generated-client';

const helpers = createValidationHelpers();
const kyHooks = createKyValidationHooks(helpers);

// Extend existing client with custom hooks
const client = createClient('https://api.example.com', {
  validate: false // Turns off all validation
  hooks: {
    beforeRequest: [kyHooks.beforeRequest],
    afterResponse: [kyHooks.afterResponse]
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

OAX includes comprehensive examples to help you get started:

- **[Basic Example](./examples/basic/)** - Complete implementation using the Petstore API with TypeScript
- **[Hooks Example](./examples/hooks/)** - React integration with TanStack Query v5 hooks

Each example includes:
- Full working code with TypeScript
- Generated API clients
- Development server setup
- Comprehensive documentation

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

```
oax/
├── packages/
│   ├── core/           # Core runtime library (@oax/core)
│   ├── cli/            # Code generation CLI (@oax/cli)
│   └── hooks/          # React Query hooks (@oax/hooks)
└── examples/
    ├── basic/          # Basic TypeScript example
    └── hooks/          # React hooks example
```

## Backwards Compatibility

All existing code continues to work without changes. Validation is additive and doesn't break existing functionality.

## License

ISC
