import { useState } from "react";
import { hooks } from "./api/hooks";
import "./App.css";

function App() {
  const [petId, setPetId] = useState(1);
  const { data: pet, isPending, error } = hooks.getPetById({ params: { petId } });

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
      </div>

      {isPending && <div className="loading">Loading pet data...</div>}

      {error && (
        <div className="error">
          <strong>Error:</strong> {error.message}
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
    </div>
  );
}

export default App;
