import { useState } from "react";

export default function GeneratePanel({ onGenerate, onRebuild, busy }) {
  const [form, setForm] = useState({ seed: 42, numCompanies: 35, numStudents: 800, numRooms: 20, numDays: 4 });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card">
      <h2>Dataset</h2>
      <p className="subtitle">
        Generate a fresh realistic placement-week dataset and build its initial schedule, or rebuild the
        schedule from the current roster (keeps any disruptions already applied).
      </p>
      <div className="generate-panel">
        <label>
          Seed
          <input type="number" value={form.seed} onChange={set("seed")} />
        </label>
        <label>
          Companies
          <input type="number" value={form.numCompanies} onChange={set("numCompanies")} />
        </label>
        <label>
          Students
          <input type="number" value={form.numStudents} onChange={set("numStudents")} />
        </label>
        <label>
          Rooms
          <input type="number" value={form.numRooms} onChange={set("numRooms")} />
        </label>
        <label>
          Days
          <input type="number" value={form.numDays} onChange={set("numDays")} />
        </label>
        <button className="primary" disabled={busy} onClick={() => onGenerate(form)}>
          Generate + schedule
        </button>
        <button disabled={busy} onClick={onRebuild}>
          Rebuild from current roster
        </button>
      </div>
    </div>
  );
}
