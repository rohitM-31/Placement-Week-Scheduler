const REASON_LABELS = {
  CAPACITY_EXHAUSTED: "Company ran out of panel-hours for its shortlist size",
  STUDENT_CONFLICT: "Student double-booked at every remaining slot",
  ROOM_SHORTAGE: "No room free at any remaining slot",
  STUDENT_WITHDRAWN: "Student withdrew",
  PANEL_UNAVAILABLE: "Panel dropped, no replacement capacity",
  ROOM_UNAVAILABLE: "Room became unavailable, no alternate found",
  NO_ALTERNATE_FOUND: "Disruption left no feasible slot",
};

export default function UnscheduledReasons({ byReason }) {
  const entries = Object.entries(byReason || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <div className="empty-state">Nothing unscheduled right now.</div>;
  }
  return (
    <div className="reason-list">
      {entries.map(([code, count]) => (
        <div className="reason-row" key={code}>
          <span>{REASON_LABELS[code] || code}</span>
          <span className="count">{count}</span>
        </div>
      ))}
    </div>
  );
}
