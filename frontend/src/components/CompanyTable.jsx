import { useState } from "react";

export default function CompanyTable({ byCompany }) {
  const days = [...new Set((byCompany || []).map((c) => c.day))].sort((a, b) => a - b);
  const [day, setDay] = useState(days[0] || 1);

  const rows = (byCompany || []).filter((c) => c.day === day);

  return (
    <div>
      <div className="tabs">
        {days.map((d) => (
          <button key={d} className={d === day ? "active" : ""} onClick={() => setDay(d)}>
            Day {d}
          </button>
        ))}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Scheduled</th>
              <th>Unscheduled</th>
              <th>Cancelled</th>
              <th>Completion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.companyId}>
                <td>{c.name}</td>
                <td>
                  <span className={`badge tier-${c.tier}`}>{c.tier}</span>
                </td>
                <td>
                  <span className={`badge ${c.status === "delayed" ? "unscheduled" : "scheduled"}`}>
                    {c.status}
                  </span>
                </td>
                <td>{c.scheduled || 0}</td>
                <td>{c.unscheduled || 0}</td>
                <td>{c.cancelled || 0}</td>
                <td>{c.total ? `${Math.round(((c.scheduled || 0) / c.total) * 100)}%` : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">
                  No companies on this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
