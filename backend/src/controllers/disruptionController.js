import { randomUUID } from "node:crypto";
import { replan } from "../scheduler/replanner.js";
import { computeMetrics } from "../scheduler/metrics.js";
import {
  loadState,
  upsertInterviews,
  upsertCompanies,
  upsertStudents,
  upsertRooms,
} from "../services/store.js";
import DisruptionLog from "../models/DisruptionLog.js";

async function runDisruption(type, payload, res, next) {
  try {
    const state = await loadState();
    const result = replan(state, { type, payload });

    // Persist only what changed: the touched interviews plus whichever
    // companies/students/rooms the handler mutated (delay window, panel
    // active flag, student status, room availability).
    const touchedInterviewIds = new Set(
      [...result.diff.moved, ...result.diff.cancelled, ...result.diff.reinstated].map(
        (x) => x.interviewId
      )
    );
    const touchedInterviews = result.interviews.filter((iv) => touchedInterviewIds.has(iv.interviewId));

    // Each disruption handler only ever mutates a small, well-known set of
    // companies/students/rooms (never the whole roster) — persist just
    // those instead of re-writing all 800 student docs on every call.
    const mutatedCompanyIds = new Set(type === "company_delay" || type === "panel_drop" ? [payload.companyId] : []);
    const mutatedStudentIds = new Set(type === "student_withdraw" ? [payload.studentId] : []);
    const mutatedRoomIds = new Set(type === "room_unavailable" ? [payload.roomId] : []);

    await Promise.all([
      upsertInterviews(touchedInterviews),
      upsertCompanies(result.companies.filter((c) => mutatedCompanyIds.has(c.companyId))),
      upsertStudents(result.students.filter((s) => mutatedStudentIds.has(s.studentId))),
      upsertRooms(result.rooms.filter((r) => mutatedRoomIds.has(r.roomId))),
    ]);

    const metrics = computeMetrics({
      companies: result.companies,
      students: result.students,
      rooms: result.rooms,
      interviews: result.interviews,
      churn: result.diff.churn,
    });

    const log = await DisruptionLog.create({
      disruptionId: randomUUID(),
      type,
      payload,
      diff: result.diff,
      metrics,
    });

    res.json({ disruptionId: log.disruptionId, diff: result.diff, metrics });
  } catch (err) {
    next(err);
  }
}

// POST /api/disruptions/company-delay { companyId, delayMinutes }
export function companyDelay(req, res, next) {
  const { companyId, delayMinutes } = req.body || {};
  if (!companyId || !delayMinutes) {
    return res.status(400).json({ error: "companyId and delayMinutes are required" });
  }
  return runDisruption("company_delay", { companyId, delayMinutes: Number(delayMinutes) }, res, next);
}

// POST /api/disruptions/panel-drop { companyId, panelId }
export function panelDrop(req, res, next) {
  const { companyId, panelId } = req.body || {};
  if (!companyId || !panelId) {
    return res.status(400).json({ error: "companyId and panelId are required" });
  }
  return runDisruption("panel_drop", { companyId, panelId }, res, next);
}

// POST /api/disruptions/student-withdraw { studentId, reason, backfill }
export function studentWithdraw(req, res, next) {
  const { studentId, reason, backfill } = req.body || {};
  if (!studentId) return res.status(400).json({ error: "studentId is required" });
  return runDisruption("student_withdraw", { studentId, reason, backfill: !!backfill }, res, next);
}

// POST /api/disruptions/room-unavailable { roomId, reason, day, fromMin }
export function roomUnavailable(req, res, next) {
  const { roomId, reason, day, fromMin } = req.body || {};
  if (!roomId) return res.status(400).json({ error: "roomId is required" });
  return runDisruption(
    "room_unavailable",
    { roomId, reason, day: day != null ? Number(day) : null, fromMin: fromMin != null ? Number(fromMin) : null },
    res,
    next
  );
}

// GET /api/disruptions/log
export async function disruptionLog(req, res, next) {
  try {
    const logs = await DisruptionLog.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(logs);
  } catch (err) {
    next(err);
  }
}
