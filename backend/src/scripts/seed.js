// CLI seeding helper — generates a fresh dataset and builds its initial
// schedule directly against the DB, without needing the API server up.
//   npm run seed                 (defaults: 35 companies / 800 students / 20 rooms / 4 days)
//   node src/scripts/seed.js --seed=7 --companies=40 --students=900
import "dotenv/config";
import connectDB from "../config/db.js";
import { generateDataset } from "../generator/dataGenerator.js";
import { buildInitialSchedule } from "../scheduler/scheduler.js";
import { computeMetrics } from "../scheduler/metrics.js";
import { saveDataset, saveInterviews } from "../services/store.js";
import mongoose from "mongoose";

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs();
  await connectDB();

  const dataset = generateDataset({
    seed: args.seed ? Number(args.seed) : undefined,
    numCompanies: args.companies ? Number(args.companies) : undefined,
    numStudents: args.students ? Number(args.students) : undefined,
    numRooms: args.rooms ? Number(args.rooms) : undefined,
    numDays: args.days ? Number(args.days) : undefined,
  });

  const companies = dataset.companies.map(({ _plannedShortlist, ...c }) => c);
  await saveDataset({ companies, students: dataset.students, rooms: dataset.rooms });

  const { interviews } = buildInitialSchedule({ companies, students: dataset.students, rooms: dataset.rooms });
  await saveInterviews(interviews);

  const metrics = computeMetrics({ companies, students: dataset.students, rooms: dataset.rooms, interviews });

  console.log("Seeded dataset:", dataset.meta);
  console.log("Initial schedule metrics:", metrics);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
