import { buildInitialSchedule } from "../scheduler/scheduler.js";
import { computeMetrics } from "../scheduler/metrics.js";
import { loadState, saveInterviews } from "../services/store.js";
import DisruptionLog from "../models/DisruptionLog.js";

// POST /api/schedule/rebuild — full re-solve from scratch using the
// companies/students/rooms currently in the DB (their disruption state
// included, e.g. a delayed window or a withdrawn student stays applied).
// This is the "start over" button, distinct from a replan: it does NOT try
// to minimize churn, it just re-solves everything. Useful for comparing
// "what a from-scratch re-optimization would look like" against the
// low-churn replan the coordinator actually used.
export async function rebuildScheduleHandler(req, res, next) {
  try {
    const { companies, students, rooms } = await loadState();
    const { interviews } = buildInitialSchedule({ companies, students, rooms });
    await saveInterviews(interviews);
    const metrics = computeMetrics({ companies, students, rooms, interviews });
    res.json({ metrics });
  } catch (err) {
    next(err);
  }
}

// GET /api/dashboard — one-call summary for the coordinator's landing view.
export async function dashboardHandler(req, res, next) {
  try {
    const { companies, students, rooms, interviews } = await loadState();
    const metrics = computeMetrics({ companies, students, rooms, interviews });

    const byDay = {};
    for (const iv of interviews) {
      byDay[iv.day] = byDay[iv.day] || { total: 0, scheduled: 0, unscheduled: 0, cancelled: 0 };
      byDay[iv.day].total++;
      byDay[iv.day][iv.status] = (byDay[iv.day][iv.status] || 0) + 1;
    }

    const companyById = new Map(companies.map((c) => [c.companyId, c]));
    const byCompany = {};
    for (const iv of interviews) {
      const c = companyById.get(iv.companyId);
      if (!c) continue;
      byCompany[iv.companyId] = byCompany[iv.companyId] || {
        companyId: iv.companyId,
        name: c.name,
        tier: c.tier,
        day: c.day,
        status: c.status,
        total: 0,
        scheduled: 0,
        unscheduled: 0,
        cancelled: 0,
      };
      byCompany[iv.companyId].total++;
      byCompany[iv.companyId][iv.status] = (byCompany[iv.companyId][iv.status] || 0) + 1;
    }

    const recentDisruptions = await DisruptionLog.find().sort({ createdAt: -1 }).limit(10).lean();

    res.json({
      metrics,
      byDay,
      byCompany: Object.values(byCompany).sort((a, b) => a.day - b.day || b.total - a.total),
      counts: { companies: companies.length, students: students.length, rooms: rooms.length },
      recentDisruptions: recentDisruptions.map((d) => ({
        disruptionId: d.disruptionId,
        type: d.type,
        createdAt: d.createdAt,
        summary: d.diff?.coordinatorNotes?.[0] || "",
        churn: d.diff?.churn,
      })),
    });
  } catch (err) {
    next(err);
  }
}
