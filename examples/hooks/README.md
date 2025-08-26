# 🐾 OAX Hooks Example

This example demonstrates how to use **@oax/hooks** with React and TanStack Query v5 to create fully type-safe API clients with React hooks. Built on top of the Petstore API, it showcases how OAX seamlessly integrates with React applications for an exceptional developer experience.

## What This Example Shows

- ✅ **React Query Integration**: Generated hooks using TanStack Query v5
- ✅ **Type-Safe Hooks**: useQuery/useMutation hooks with full TypeScript support
- ✅ **Automatic Caching**: Built-in caching, background updates, and synchronization
- ✅ **Loading States**: Proper loading, error, and success state management
- ✅ **React 19 Compatible**: Works with the latest React version
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
- `pnpm run generate` - Regenerate API client from OpenAPI spec

## How It Works

### 1. Client Generation

The API client is generated from the Petstore v3 OpenAPI spec:

```bash
# This command was used to generate the client
node ../../packages/cli/dist/index.js generate \
  -i https://petstore3.swagger.io/api/v3/openapi.json \
  -o src/api/client.ts
```

### 2. Hooks Creation

React hooks are created using the generated client:

```typescript
import { createHooks } from "@oax/hooks";
import { createClient, operations } from "./client";

const client = createClient("https://petstore3.swagger.io/api/v3/");

export const hooks = createHooks({
  apiName: "petstore",
  client,
  operations,
});
```

### 3. Hook Usage in Components

```typescript
import { hooks } from "./api/hooks";

function App() {
  const [petId, setPetId] = useState(1);
  
  // Type-safe hook with automatic loading states
  const { data: pet, isPending, error } = hooks.getPetById({ 
    params: { petId } 
  });

  return (
    <div>
      {isPending && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
      {pet && <div>Pet: {pet.name}</div>}
    </div>
  );
}
```

## Key Features Demonstrated

### Type-Safe React Hooks

Every generated hook provides full type safety:

```typescript
// ✅ TypeScript knows the exact parameter types
const { data, isPending, error } = hooks.getPetById({ 
  params: { petId: 123 } 
});

// ✅ TypeScript knows the exact response type
if (data) {
  console.log(data.name);     // string
  console.log(data.status);   // "available" | "pending" | "sold"
  console.log(data.category?.name); // string | undefined
}

// ❌ TypeScript prevents invalid usage
hooks.getPetById({ params: { wrongParam: 123 } }); // Compile error
hooks.getPetById({ params: { petId: "invalid" } }); // Compile error
```

### Automatic Query Management

TanStack Query provides powerful features out of the box:

- **Caching**: Queries are automatically cached and deduplicated
- **Background Updates**: Data is refetched in the background
- **Loading States**: Built-in loading, error, and success states
- **Optimistic Updates**: For mutations with immediate UI feedback

### React Query Integration

```typescript
// Query with automatic caching and background refetch
const { data, isPending, error, refetch } = hooks.getPetById({
  params: { petId: 1 }
});

// Mutation with loading states and error handling
const mutation = hooks.addPet.useMutation({
  onSuccess: () => {
    // Invalidate and refetch pet queries
    queryClient.invalidateQueries({ queryKey: ["petstore", "getPetById"] });
  }
});
```

## Project Structure

```
examples/hooks/
├── src/
│   ├── api/
│   │   ├── client.ts          # Generated API client
│   │   └── hooks.ts           # React Query hooks
│   ├── App.tsx                # Main React component
│   ├── App.css                # Styling
│   └── main.tsx               # React app entry point
├── package.json               # Project dependencies
└── README.md                  # This file
```

## Dependencies

### Core Dependencies
- **@oax/core**: Core runtime library for API clients
- **@oax/hooks**: React Query hooks for OAX clients
- **@tanstack/react-query**: TanStack Query v5 for data fetching
- **react**: React 19+ for UI components
- **zod**: Runtime validation schemas

### Development Dependencies
- **@vitejs/plugin-react**: Vite React plugin
- **typescript**: TypeScript compiler
- **vite**: Build tool and dev server

## Advanced Usage

### Query Options

Customize query behavior with TanStack Query options:

```typescript
const { data, isPending, error } = hooks.getPetById({
  params: { petId: 1 },
  query: {
    refetchInterval: 5000,      // Refetch every 5 seconds
    staleTime: 1000 * 60,       // Consider data stale after 1 minute
    enabled: petId > 0,         // Only run query when petId is valid
  }
});
```

### Mutation with Optimistic Updates

```typescript
const updatePetMutation = hooks.updatePet.useMutation({
  onMutate: async (newPet) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ["petstore", "getPetById"] });
    
    // Snapshot previous value
    const previousPet = queryClient.getQueryData(["petstore", "getPetById", newPet.id]);
    
    // Optimistically update
    queryClient.setQueryData(["petstore", "getPetById", newPet.id], newPet);
    
    return { previousPet };
  },
  onError: (err, newPet, context) => {
    // Rollback on error
    queryClient.setQueryData(
      ["petstore", "getPetById", newPet.id], 
      context?.previousPet
    );
  },
  onSettled: () => {
    // Always refetch after error or success
    queryClient.invalidateQueries({ queryKey: ["petstore", "getPetById"] });
  },
});
```

### Error Handling

Handle different types of errors gracefully:

```typescript
const { data, error, isError } = hooks.getPetById({ params: { petId: 999 } });

if (isError) {
  if (error.status === 404) {
    return <div>Pet not found</div>;
  }
  if (error.status >= 500) {
    return <div>Server error, please try again later</div>;
  }
  return <div>Something went wrong: {error.message}</div>;
}
```

## Regenerating the Client

When the API changes, regenerate both the client and hooks:

```bash
# Update the generated client
pnpm run generate

# TypeScript will immediately show you what changed in your hooks!
```

## Performance Benefits

### Automatic Optimizations
- **Request Deduplication**: Multiple components requesting the same data share a single request
- **Background Refetching**: Data stays fresh without blocking the UI
- **Intelligent Caching**: Reduces unnecessary network requests
- **Partial Data Updates**: Only re-render components when their data changes

### Bundle Size
- **Tree Shaking**: Only hooks you use are included in the bundle
- **Lazy Loading**: Query logic is loaded on-demand
- **Minimal Runtime**: Efficient runtime with minimal overhead

## Comparison with Basic Example

| Feature | Basic Example | Hooks Example |
|---------|---------------|---------------|
| **React Integration** | Manual useState/useEffect | Automatic hooks |
| **Caching** | Manual implementation | Built-in with TanStack Query |
| **Loading States** | Manual management | Automatic |
| **Error Handling** | Manual try/catch | Built-in error boundaries |
| **Background Updates** | Not supported | Automatic |
| **Optimistic Updates** | Manual implementation | Built-in support |
| **DevTools** | Limited | Full React Query DevTools |

## Next Steps

Try extending this example to:
- Add mutation examples (create, update, delete pets)
- Implement infinite queries for pagination
- Add optimistic updates for better UX
- Integrate with form libraries like React Hook Form
- Add real-time data with WebSocket integration
- Implement offline support with background sync

## Learn More

- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [OAX Documentation](../../README.md)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Happy coding with type-safe React hooks!** 🎉