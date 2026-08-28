/**
 * Metrics that define what "good" means for this scheduler. Defended in
 * README §"What does a good schedule mean" — summarized here:
 *
 *  - completionRate: % of required interviews actually scheduled. The
 *    single top-line number a coordinator cares about first.
 *  - studentClashCount: interviews where the SAME student is double-booked
 *    at overlapping times. Must always be 0 — it's a hard constraint, not a
 *    soft one — so this metric exists purely as a correctness tripwire.
 *  - roomUtilization / panelUtilization: booked-minutes ÷ available-minutes,
 *    per day and overall. Tells the coordinator whether the room shortage
 *    is real (>90%) or whether slack exists somewhere.
 *  - avgStudentWaitMinutes: for students with 2+ interviews the same day,
 *    the average idle gap between consecutive interviews. A schedule that
 *    is 100% "feasible" but leaves students idle 4 hours between two
 *    10-minute interviews is not a good schedule.
 *  - unscheduledByReason: breakdown so the coordinator sees WHY, not just
 *    how many.
 *  - replanChurn (only present after a replan): % of previously-scheduled
 *    interviews whose room/panel/time actually changed. This is the number
 *    that keeps a 2-hour delay from turning into "200 appointments moved".
 */
export function computeMetrics({ companies, students, rooms, interviews, churn = null }) {
  const scheduled = interviews.filter((i) => i.status === "scheduled");
  const unscheduled = interviews.filter((i) => i.status === "unscheduled");
  const cancelled = interviews.filter((i) => i.status === "cancelled");
  const total = interviews.length;

  const completionRate = total === 0 ? 1 : scheduled.length / total;

  // Correctness tripwire: recompute clashes independently of the tracker
  // used during scheduling, so a bug in the scheduler would show up here.
  const byStudentDay = new Map();
  for (const iv of scheduled) {
    const key = `${iv.studentId}#${iv.day}`;
    if (!byStudentDay.has(key)) byStudentDay.set(key, []);
    byStudentDay.get(key).push(iv);
  }
  let studentClashCount = 0;
  const clashDetails = [];
  for (const [key, list] of byStudentDay) {
    list.sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < list.length; i++) {
      if (list[i].startMin < list[i - 1].endMin) {
        studentClashCount++;
        clashDetails.push({ key, a: list[i - 1].interviewId, b: list[i].interviewId });
      }
    }
  }

  // Room / panel utilization (booked minutes / available minutes) across
  // the days actually in use.
  const daysUsed = [...new Set(companies.map((c) => c.day))];
  const roomMinutesAvailablePerDay = 9 * 60; // campus day ~09:00-18:00 reference window
  let roomBookedMinutes = 0;
  for (const iv of scheduled) roomBookedMinutes += iv.endMin - iv.startMin;
  const roomMinutesAvailable = rooms.length * daysUsed.length * roomMinutesAvailablePerDay;
  const roomUtilization = roomMinutesAvailable === 0 ? 0 : roomBookedMinutes / roomMinutesAvailable;

  let panelCapacityMinutes = 0;
  for (const c of companies) {
    const winMin =
      (parseInt(c.windowEnd.split(":")[0], 10) * 60 + parseInt(c.windowEnd.split(":")[1], 10)) -
      (parseInt(c.windowStart.split(":")[0], 10) * 60 + parseInt(c.windowStart.split(":")[1], 10));
    panelCapacityMinutes += winMin * c.panels.filter((p) => p.active).length;
  }
  const panelBookedMinutes = roomBookedMinutes; // 1 interview = 1 panel = 1 room-slot
  const panelUtilization = panelCapacityMinutes === 0 ? 0 : panelBookedMinutes / panelCapacityMinutes;

  // Average student waiting time: gap between consecutive interviews for
  // students with 2+ interviews on the same day.
  let gapSum = 0;
  let gapCount = 0;
  for (const [, list] of byStudentDay) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].startMin - sorted[i - 1].endMin;
      if (gap >= 0) {
        gapSum += gap;
        gapCount++;
      }
    }
  }
  const avgStudentWaitMinutes = gapCount === 0 ? 0 : gapSum / gapCount;

  const unscheduledByReason = {};
  for (const iv of unscheduled) {
    unscheduledByReason[iv.reasonCode] = (unscheduledByReason[iv.reasonCode] || 0) + 1;
  }

  const withdrawnStudents = students.filter((s) => s.status === "withdrawn").length;

  return {
    totalRequiredInterviews: total,
    scheduledCount: scheduled.length,
    unscheduledCount: unscheduled.length,
    cancelledCount: cancelled.length,
    completionRate: round(completionRate),
    studentClashCount,
    clashDetails,
    roomUtilization: round(roomUtilization),
    panelUtilization: round(panelUtilization),
    avgStudentWaitMinutes: Math.round(avgStudentWaitMinutes),
    unscheduledByReason,
    withdrawnStudents,
    daysUsed,
    ...(churn ? { replanChurn: churn } : {}),
  };
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}
