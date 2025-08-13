import type { ParamsById, QueriesById } from "@zoddy/core";
import type { operations } from "../api/client";
import { hooks } from "../api/hooks";

export const PetDetail = ({
  params,
  queries,
}: {
  params: ParamsById<typeof operations, "getPetById">;
  queries?: QueriesById<typeof operations, "getPetById">;
}) => {
  const {
    data: pet,
    isPending,
    isRefetching,
    error,
  } = hooks.useGetPetById({
    params,
    queries,
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    pet && (
      <div className="pet-card">
        <h2>
          🐕 {pet.name} {isRefetching && <span className="loading">🔄</span>}
        </h2>
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
    )
  );
};
