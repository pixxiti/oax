import { useState } from "react";
import "./App.css";
import { PetDetail } from "./components/PetDetail";
import { UpdatePet } from "./components/UpdatePet";

function App() {
  const [petId, setPetId] = useState(1);

  return (
    <div className="app">
      <h1>🐾 OAX Hooks Demo</h1>
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
      </div>{" "}
      <PetDetail params={{ petId }} />
      <UpdatePet params={{ petId }} />
    </div>
  );
}

export default App;
