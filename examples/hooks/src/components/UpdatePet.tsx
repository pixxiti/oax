import { useQueryClient } from "@tanstack/react-query";
import type { ParamsById, ResponseById } from "@oax/core";
import type React from "react";
import { useState } from "react";
import type { operations } from "../api/client";
import { hooks } from "../api/hooks";

type Params = ParamsById<typeof operations, "getPetById">;
type Response = ResponseById<typeof operations, "getPetById">;

export const UpdatePetForm = ({
  params,
  defaultValues,
}: { params: Params; defaultValues: Response }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(defaultValues);

  const {
    mutate: updatePet,
    isPending,
    isError,
    error,
  } = hooks.useUpdatePet({
    onSuccess: () => {
      console.log("Invalidating getPetById", hooks.getKey("getPetById", { params }));
      queryClient.invalidateQueries({ queryKey: hooks.getKey("getPetById", { params }) });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    updatePet({
      id: params.petId,
      name: formData.name,
      status: formData.status,
      photoUrls: formData.photoUrls,
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="update-pet">
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">Pet Name:</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
          />
        </div>

        <div>
          <label htmlFor="status">Status:</label>
          <select id="status" name="status" value={formData.status} onChange={handleInputChange}>
            <option value="available">Available</option>
            <option value="pending">Pending</option>
            <option value="sold">Sold</option>
          </select>
        </div>

        <div>
          <label htmlFor="photoUrls">Photo URL:</label>
          <input
            type="url"
            id="photoUrls"
            name="photoUrls"
            value={formData.photoUrls[0]}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                photoUrls: [e.target.value],
              }))
            }
          />
        </div>

        <button type="submit" disabled={isPending}>
          {isPending ? "Updating..." : "Update Pet"}
        </button>

        {isError && (
          <div style={{ color: "red", marginTop: "10px" }}>
            Error: {error?.message || "Failed to update pet"}
          </div>
        )}
      </form>
    </div>
  );
};

export const UpdatePet = ({ params }: { params: Params }) => {
  const { data: pet, isPending, error } = hooks.useGetPetById({ params });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return <UpdatePetForm params={params} defaultValues={pet} />;
};
