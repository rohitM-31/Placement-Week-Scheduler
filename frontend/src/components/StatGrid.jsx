function pct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}

function tone(value, { warnBelow, badBelow }) {
  if (badBelow != null && value < badBelow) return "bad";
  if (warnBelow != null && value < warnBelow) return "warn";
  return "ok";
}

export default function StatGrid({ metrics }) {
  if (!metrics) return null;
  return (
    <div className="stat-grid">
      <div className={`stat ${tone(metrics.completionRate, { warnBelow: 0.6, badBelow: 0.35 })}`}>
        <div className="value">{pct(metrics.completionRate)}</div>
        <div className="label">Interviews scheduled</div>
      </div>
      <div className="stat">
        <div className="value">{metrics.scheduledCount}</div>
        <div className="label">Scheduled</div>
      </div>
      <div className="stat">
        <div className="value">{metrics.unscheduledCount}</div>
        <div className="label">Unscheduled</div>
      </div>
      <div className={`stat ${metrics.studentClashCount === 0 ? "ok" : "bad"}`}>
        <div className="value">{metrics.studentClashCount}</div>
        <div className="label">Student clashes</div>
      </div>
      <div className={`stat ${tone(metrics.roomUtilization, { warnBelow: 0.4 })}`}>
        <div className="value">{pct(metrics.roomUtilization)}</div>
        <div className="label">Room utilization</div>
      </div>
      <div className={`stat ${tone(metrics.panelUtilization, { warnBelow: 0.4 })}`}>
        <div className="value">{pct(metrics.panelUtilization)}</div>
        <div className="label">Panel utilization</div>
      </div>
      <div className="stat">
        <div className="value">{metrics.avgStudentWaitMinutes}m</div>
        <div className="label">Avg student wait</div>
      </div>
      {metrics.replanChurn && (
        <div className={`stat ${tone(1 - metrics.replanChurn.churnRate, { warnBelow: 0.7, badBelow: 0.4 })}`}>
          <div className="value">{pct(metrics.replanChurn.churnRate)}</div>
          <div className="label">Last replan churn</div>
        </div>
      )}
    </div>
  );
}
