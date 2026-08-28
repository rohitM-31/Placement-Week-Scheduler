import { generateDataset } from "../generator/dataGenerator.js";
import { buildInitialSchedule } from "../scheduler/scheduler.js";
import { computeMetrics } from "../scheduler/metrics.js";
import { saveDataset, saveInterviews } from "../services/store.js";
import DisruptionLog from "../models/DisruptionLog.js";

// POST /api/dataset/generate  — generate a new dataset AND immediately build
// its initial schedule, since an ungenerated/unscheduled dataset isn't
// useful to look at. Returns the metrics so the client can render instantly.
export async function generateDatasetHandler(req, res, next) {
  try {
    const { seed, numCompanies, numStudents, numRooms, numDays } = req.body || {};
    const dataset = generateDataset({
      seed: seed != null ? Number(seed) : undefined,
      numCompanies: numCompanies != null ? Number(numCompanies) : undefined,
      numStudents: numStudents != null ? Number(numStudents) : undefined,
      numRooms: numRooms != null ? Number(numRooms) : undefined,
      numDays: numDays != null ? Number(numDays) : undefined,
    });

    // strip generator-internal fields before persisting
    const companies = dataset.companies.map(({ _plannedShortlist, ...c }) => c);

    await saveDataset({ companies, students: dataset.students, rooms: dataset.rooms });

    const { interviews } = buildInitialSchedule({
      companies,
      students: dataset.students,
      rooms: dataset.rooms,
    });
    await saveInterviews(interviews);
    await DisruptionLog.deleteMany({});

    const metrics = computeMetrics({ companies, students: dataset.students, rooms: dataset.rooms, interviews });

    res.json({
      meta: dataset.meta,
      counts: { companies: companies.length, students: dataset.students.length, rooms: dataset.rooms.length },
      metrics,
    });
  } catch (err) {
    next(err);
  }
}
