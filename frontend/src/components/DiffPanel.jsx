export default function DiffPanel({ result }) {
  if (!result) {
    return (
      <div className="card">
        <h2>Change summary</h2>
        <div className="empty-state">Run a disruption to see its replan diff here.</div>
      </div>
    );
  }

  const { diff } = result;
  const churnPct = Math.round((diff.churn?.churnRate || 0) * 100);

  return (
    <div className="card">
      <h2>Change summary</h2>
      <p className="subtitle">
        {diff.disruptionType.replace("_", " ")} — this is exactly what changed and who needs to be told.
      </p>
      <div className="diff-panel">
        <div className="diff-summary">
          <div className="stat">
            <div className="value">{diff.moved.length}</div>
            <div className="label">Moved</div>
          </div>
          <div className="stat">
            <div className="value">{diff.cancelled.length}</div>
            <div className="label">Cancelled</div>
          </div>
          <div className="stat">
            <div className="value">{diff.reinstated.length}</div>
            <div className="label">Backfilled</div>
          </div>
          <div className={`stat ${churnPct <= 30 ? "ok" : churnPct <= 70 ? "warn" : "bad"}`}>
            <div className="value">{churnPct}%</div>
            <div className="label">Churn</div>
          </div>
        </div>

        {diff.coordinatorNotes?.map((note, i) => (
          <div className="note-box" key={i}>
            {note}
          </div>
        ))}

        <div className="pill-row small-muted">
          <span>{diff.affectedStudents.length} students to notify</span>
          <span>·</span>
          <span>{diff.affectedCompanies.length} companies to notify</span>
        </div>

        {diff.moved.length > 0 && (
          <div>
            <h3 style={{ fontSize: 12.5, margin: "6px 0" }}>Moved</h3>
            <div className="table-scroll" style={{ maxHeight: 180 }}>
              <table>
                <thead>
                  <tr>
                    <th>Interview</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.moved.slice(0, 50).map((m) => (
                    <tr key={m.interviewId}>
                      <td>
                        {m.studentId} × {m.companyId}
                      </td>
                      <td className="small-muted">{m.before}</td>
                      <td className="small-muted">{m.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {diff.cancelled.length > 0 && (
          <div>
            <h3 style={{ fontSize: 12.5, margin: "6px 0" }}>Cancelled / could not be salvaged</h3>
            <div className="table-scroll" style={{ maxHeight: 180 }}>
              <table>
                <thead>
                  <tr>
                    <th>Interview</th>
                    <th>Was at</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.cancelled.slice(0, 50).map((c) => (
                    <tr key={c.interviewId}>
                      <td>
                        {c.studentId} × {c.companyId}
                      </td>
                      <td className="small-muted">{c.wasAt}</td>
                      <td className="small-muted">{c.reasonCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
