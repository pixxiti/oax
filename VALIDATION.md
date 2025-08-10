# Zoddy Validation Features

This document describes the new validation features added to Zoddy, which provide runtime validation of API requests and responses using Zod schemas.

## Features

### ✅ Automatic Input/Output Validation
- **Request Parameters**: Validates path, query, and header parameters against their Zod schemas
- **Request Body**: Validates request body data against Zod schemas
- **Response Data**: Validates API response data against expected Zod schemas

### ✅ Validation Control
- **Default Behavior**: Validation is **enabled by default**
- **Opt-out**: Pass `validate: false` to disable validation
- **Custom Hooks**: Export validation helpers for custom ky hook configuration

### ✅ Developer-Friendly Error Messages
- Console-readable error format with emojis and detailed context
- Shows validation path and specific error messages
- Includes the actual data that failed validation

## Usage

### Basic Usage (Validation Enabled by Default)

```typescript
import { createClient } from './generated-client';

const client = createClient('https://api.example.com');
// Validation is automatically enabled
```

### Disable Validation

```typescript
const client = createClient('https://api.example.com', {
  validate: false // Turns off all validation
});
```

### Custom Validation Hooks

```typescript
import { 
  createValidationHelpers, 
  createKyValidationHooks, 
  ValidationError 
} from '@zoddy/core';

const helpers = createValidationHelpers();
const hooks = createKyValidationHooks(helpers);

// Use with custom ky instance
const customKy = ky.create({
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

## Exported Functions

- `createValidationHelpers()`: Creates validation helper functions
- `createKyValidationHooks(helpers)`: Creates ky hooks for validation
- `ValidationError`: Error class for validation failures
- `ValidationHelpers`: Interface for validation helper functions
- `KyValidationHooks`: Interface for ky validation hooks

## Backwards Compatibility

All existing code continues to work without changes. Validation is additive and doesn't break existing functionality.