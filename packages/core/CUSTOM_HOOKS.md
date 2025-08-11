# Custom Hooks with Zoddy

You can define custom hooks directly when creating a Zoddy client by passing them in the `hooks` option. Your hooks will be automatically combined with Zoddy's built-in validation hooks.

## Basic Example

```typescript
import { createClient } from '@zoddy/core';
import type { Hooks } from 'ky';
import { operations } from './generated-client';

const client = createClient('https://api.example.com', operations, {
  hooks: {
    beforeRequest: [
      (request, options) => {
        // Add auth header
        request.headers.set('Authorization', `Bearer ${getToken()}`);
        
        // Log all requests
        console.log(`Making ${request.method} request to ${request.url}`);
        
        return request;
      }
    ],
    afterResponse: [
      (request, options, response) => {
        // Log response status
        console.log(`${request.method} ${request.url} -> ${response.status}`);
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          console.warn(`Rate limited. Retry after ${retryAfter}s`);
        }
        
        return response;
      }
    ],
    beforeError: [
      (error) => {
        // Transform 404s into custom errors
        if (error.response?.status === 404) {
          return new CustomNotFoundError(error.message);
        }
        return error;
      }
    ]
  }
});
```

## Advanced Example: Request/Response Transformation

```typescript
const client = createClient('https://api.example.com', operations, {
  hooks: {
    beforeRequest: [
      (request, options) => {
        // Transform all request bodies to snake_case
        if (options.json && typeof options.json === 'object') {
          options.json = transformToSnakeCase(options.json);
        }
        return request;
      }
    ],
    afterResponse: [
      async (request, options, response) => {
        // Transform all JSON responses from snake_case to camelCase
        if (response.headers.get('content-type')?.includes('application/json')) {
          const originalJson = response.json;
          response.json = async () => {
            const data = await originalJson.call(response);
            return transformToCamelCase(data);
          };
        }
        return response;
      }
    ]
  }
});
```

## Validation is Automatic

When you define custom hooks, Zoddy's validation hooks are automatically included. Your hooks run alongside the built-in validation:

```typescript
const client = createClient('https://api.example.com', operations, {
  hooks: {
    beforeRequest: [
      (request, options) => {
        // Your custom logic runs after validation
        request.headers.set('X-Custom-Header', 'value');
        return request;
      }
    ]
  }
});
```

## Accessing Operation Context

The operation definition is passed through the request options, so you can access it in your hooks:

```typescript
const client = createClient('https://api.example.com', operations, {
  hooks: {
    beforeRequest: [
      (request, options) => {
        const operation = (options as any).operation;
        if (operation?.operationId === 'sensitiveOperation') {
          // Add extra security headers for sensitive operations
          request.headers.set('X-Require-MFA', 'true');
        }
        return request;
      }
    ]
  }
});
```

## Alternative: Extending with ky

If you need more complex hook logic, you can still extend the underlying `ky` instance:

```typescript
const baseClient = createClient('https://api.example.com', operations);

const client = {
  ...baseClient,
  ky: baseClient.ky.extend({
    hooks: {
      beforeRequest: [
        (request, options) => {
          // Additional complex logic here
          return request;
        }
      ]
    }
  })
};
```

This approach gives you maximum flexibility while keeping the core Zoddy API simple and focused.