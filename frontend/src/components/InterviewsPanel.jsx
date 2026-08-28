import { useEffect, useState } from "react";
import { api } from "../api/client.js";

function minToHHMM(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor(min % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}`;
}

export default function InterviewsPanel({ companies, rooms, refreshToken }) {
  const [day, setDay] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = {};
    if (day) params.day = day;
    if (companyId) params.companyId = companyId;
    if (status) params.status = status;
    api
      .interviews(params)
      .then((data) => {
        if (!cancelled) setInterviews(data.slice(0, 300));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [day, companyId, status, refreshToken]);

  const companyName = (id) => companies.find((c) => c.companyId === id)?.name || id;

  return (
    <div className="card">
      <h2>Interview schedule</h2>
      <p className="subtitle">Live view of individual interviews. Showing up to 300 matching rows.</p>
      <div className="disruption-form" style={{ marginBottom: 12 }}>
        <div className="row">
          <label>
            Day
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">All</option>
              {[1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Company
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">All</option>
              {companies.map((c) => (
                <option key={c.companyId} value={c.companyId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="unscheduled">Unscheduled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Company</th>
              <th>Day</th>
              <th>Time</th>
              <th>Room</th>
              <th>Panel</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {interviews.map((iv) => (
              <tr key={iv.interviewId}>
                <td>{iv.studentId}</td>
                <td>{companyName(iv.companyId)}</td>
                <td>{iv.day}</td>
                <td>
                  {iv.startMin != null ? `${minToHHMM(iv.startMin)}–${minToHHMM(iv.endMin)}` : "—"}
                </td>
                <td>{iv.roomId || "—"}</td>
                <td>{iv.panelId || "—"}</td>
                <td>
                  <span className={`badge ${iv.status}`}>{iv.status}</span>
                </td>
                <td style={{ whiteSpace: "normal", maxWidth: 260 }} className="small-muted">
                  {iv.reasonDetail || ""}
                </td>
              </tr>
            ))}
            {!loading && interviews.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  No interviews match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
