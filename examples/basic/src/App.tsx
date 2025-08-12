import { createClient } from "@zoddy/core";
import { useCallback, useEffect, useState } from "react";
import type { z } from "zod/v4";
import { operations, type schemas } from "./api/client";
import "./App.css";

// Create typed client with full type safety
const client = createClient("https://petstore.swagger.io/v2", operations);

type Pet = z.infer<typeof schemas.Pet>;

function App() {
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [petId, setPetId] = useState(1);

  const fetchPet = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);

      // This call is fully typed! TypeScript knows the parameter structure
      // and return type based on the OpenAPI spec
      const result = await client.getPetById({ params: { petId: id } });
      setPet(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pet");
      setPet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPet(petId);
  }, [fetchPet, petId]);

  const handleFetchPet = () => {
    fetchPet(petId);
  };

  return (
    <div className="app">
      <h1>🐾 Zoddy Petstore Demo</h1>
      <p>
        This demo showcases <strong>full type safety</strong> with OpenAPI-generated clients
      </p>

      <div className="controls">
        <label>
          Pet ID:
          <input
            type="number"
            value={petId}
            onChange={(e) => setPetId(Number(e.target.value))}
            min="1"
            max="10"
          />
        </label>
        <button type="button" onClick={handleFetchPet} disabled={loading}>
          {loading ? "Loading..." : "Fetch Pet"}
        </button>
      </div>

      {loading && <div className="loading">Loading pet data...</div>}

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {pet && (
        <div className="pet-card">
          <h2>🐕 {pet.name}</h2>
          <div className="pet-details">
            <p>
              <strong>ID:</strong> {pet.id}
            </p>
            <p>
              <strong>Status:</strong> <span className={`status ${pet.status}`}>{pet.status}</span>
            </p>
            {pet.category && (
              <p>
                <strong>Category:</strong> {pet.category.name}
              </p>
            )}
            {pet.tags && pet.tags.length > 0 && (
              <div>
                <strong>Tags:</strong>
                <div className="tags">
                  {pet.tags.map((tag) => (
                    <span key={tag.id} className="tag">
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {pet.photoUrls && pet.photoUrls.length > 0 && (
              <div>
                <strong>Photos:</strong>
                <div className="photos">
                  {pet.photoUrls.map((url, index) => (
                    <img
                      key={`${pet.id}-photo-${index}`}
                      src={url}
                      alt={`${pet.name} ${index + 1}`}
                      className="pet-photo"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="type-safety-demo">
        <h3>🛡️ Type Safety in Action</h3>
        <div className="code-example">
          <pre>
            {`// TypeScript knows exactly what parameters are required:
await client.getPetById({ params: { petId: 1 } });

// TypeScript will error if you pass wrong parameters:
// await client.getPetById({ params: { wrongParam: 1 } }); // ❌ Type error!

// TypeScript knows the return type structure:
const pet = await client.getPetById({ params: { petId: 1 } });
console.log(pet.name);    // ✅ TypeScript knows this exists
console.log(pet.status);  // ✅ TypeScript knows this is "available" | "pending" | "sold"`}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default App;
