function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export default function DisruptionLogPanel({ log }) {
  if (!log || log.length === 0) {
    return (
      <div className="card">
        <h2>Recent disruptions</h2>
        <div className="empty-state">No disruptions logged yet this session.</div>
      </div>
    );
  }
  return (
    <div className="card">
      <h2>Recent disruptions</h2>
      <p className="subtitle">Audit trail of every replan run, most recent first.</p>
      <div style={{ maxHeight: 280, overflow: "auto" }}>
        {log.map((d) => (
          <div className="log-item" key={d.disruptionId}>
            <strong>{d.type.replace("_", " ")}</strong>
            <div className="meta">
              {timeAgo(d.createdAt)} · churn {Math.round((d.churn?.churnRate || 0) * 100)}%
            </div>
            <div className="small-muted" style={{ marginTop: 4 }}>
              {d.summary}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
