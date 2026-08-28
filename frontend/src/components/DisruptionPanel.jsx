import { useState } from "react";
import { api } from "../api/client.js";

const TYPES = [
  { key: "delay", label: "Company delay" },
  { key: "panel", label: "Panel drop" },
  { key: "withdraw", label: "Student withdraw" },
  { key: "room", label: "Room unavailable" },
];

export default function DisruptionPanel({ companies, students, rooms, onResult, setBusy, busy }) {
  const [tab, setTab] = useState("delay");
  const [error, setError] = useState("");

  const [delayForm, setDelayForm] = useState({ companyId: "", delayMinutes: 120 });
  const [panelForm, setPanelForm] = useState({ companyId: "", panelId: "" });
  const [withdrawForm, setWithdrawForm] = useState({ studentId: "", reason: "Accepted another offer", backfill: false });
  const [roomForm, setRoomForm] = useState({ roomId: "", reason: "AC / facilities failure", day: "" });

  const selectedCompany = companies.find((c) => c.companyId === panelForm.companyId);

  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      const result = await fn();
      onResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Trigger a disruption</h2>
      <p className="subtitle">
        Simulates what happens on the day. Each replan only touches interviews directly affected — see the
        change summary after running one.
      </p>
      <div className="tabs">
        {TYPES.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "delay" && (
        <div className="disruption-form">
          <h3>Company arrives late</h3>
          <p className="desc">
            Shifts that company's remaining interviews later (extending its own day, capped at 7pm). Never
            touches other companies' interviews.
          </p>
          <div className="row">
            <label>
              Company
              <select
                value={delayForm.companyId}
                onChange={(e) => setDelayForm({ ...delayForm, companyId: e.target.value })}
              >
                <option value="">Select…</option>
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name} (Day {c.day})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Delay (minutes)
              <input
                type="number"
                value={delayForm.delayMinutes}
                onChange={(e) => setDelayForm({ ...delayForm, delayMinutes: e.target.value })}
              />
            </label>
          </div>
          <button
            className="primary"
            disabled={busy || !delayForm.companyId}
            onClick={() =>
              run(() => api.companyDelay({ companyId: delayForm.companyId, delayMinutes: Number(delayForm.delayMinutes) }))
            }
          >
            Replan
          </button>
        </div>
      )}

      {tab === "panel" && (
        <div className="disruption-form">
          <h3>Panel drops out</h3>
          <p className="desc">Its remaining interviews are absorbed by the company's other active panels where possible.</p>
          <div className="row">
            <label>
              Company
              <select
                value={panelForm.companyId}
                onChange={(e) => setPanelForm({ companyId: e.target.value, panelId: "" })}
              >
                <option value="">Select…</option>
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Panel
              <select
                value={panelForm.panelId}
                onChange={(e) => setPanelForm({ ...panelForm, panelId: e.target.value })}
                disabled={!selectedCompany}
              >
                <option value="">Select…</option>
                {(selectedCompany?.panels || [])
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.panelId} value={p.panelId}>
                      {p.name} ({p.panelId})
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <button
            className="primary"
            disabled={busy || !panelForm.companyId || !panelForm.panelId}
            onClick={() => run(() => api.panelDrop(panelForm))}
          >
            Replan
          </button>
        </div>
      )}

      {tab === "withdraw" && (
        <div className="disruption-form">
          <h3>Student withdraws</h3>
          <p className="desc">
            Cancels their remaining interviews and frees those slots. By default nothing else moves —
            backfilling from the waitlist is opt-in.
          </p>
          <div className="row">
            <label>
              Student ID
              <input
                placeholder="e.g. S0007"
                value={withdrawForm.studentId}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, studentId: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              Reason
              <input
                value={withdrawForm.reason}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, reason: e.target.value })}
              />
            </label>
          </div>
          <div className="checkbox-row">
            <input
              type="checkbox"
              checked={withdrawForm.backfill}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, backfill: e.target.checked })}
            />
            Backfill freed slots from the waitlist (adds churn)
          </div>
          <button
            className="primary"
            disabled={busy || !withdrawForm.studentId}
            onClick={() => run(() => api.studentWithdraw(withdrawForm))}
          >
            Replan
          </button>
        </div>
      )}

      {tab === "room" && (
        <div className="disruption-form">
          <h3>Room becomes unavailable</h3>
          <p className="desc">
            Tries to relocate each affected interview to another room at the same time first; only shifts the
            time if it must.
          </p>
          <div className="row">
            <label>
              Room
              <select value={roomForm.roomId} onChange={(e) => setRoomForm({ ...roomForm, roomId: e.target.value })}>
                <option value="">Select…</option>
                {rooms.map((r) => (
                  <option key={r.roomId} value={r.roomId}>
                    {r.name} ({r.roomId})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Day (optional)
              <select value={roomForm.day} onChange={(e) => setRoomForm({ ...roomForm, day: e.target.value })}>
                <option value="">All days</option>
                {[1, 2, 3, 4].map((d) => (
                  <option key={d} value={d}>
                    Day {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <input value={roomForm.reason} onChange={(e) => setRoomForm({ ...roomForm, reason: e.target.value })} />
            </label>
          </div>
          <button
            className="primary"
            disabled={busy || !roomForm.roomId}
            onClick={() =>
              run(() =>
                api.roomUnavailable({
                  roomId: roomForm.roomId,
                  reason: roomForm.reason,
                  day: roomForm.day || null,
                })
              )
            }
          >
            Replan
          </button>
        </div>
      )}

      {error && <div className="note-box" style={{ borderColor: "#5c2727", color: "var(--red)" }}>{error}</div>}
    </div>
  );
}
