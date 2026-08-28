import Company from "../models/Company.js";
import Student from "../models/Student.js";
import Room from "../models/Room.js";
import Interview from "../models/Interview.js";

/** Loads the full current state as plain objects (scheduler/replanner are DB-agnostic). */
export async function loadState() {
  const [companies, students, rooms, interviews] = await Promise.all([
    Company.find().lean(),
    Student.find().lean(),
    Room.find().lean(),
    Interview.find().lean(),
  ]);
  return { companies, students, rooms, interviews };
}

/** Persists a full dataset (used right after generation). Wipes existing data first. */
export async function saveDataset({ companies, students, rooms }) {
  await Promise.all([Company.deleteMany({}), Student.deleteMany({}), Room.deleteMany({}), Interview.deleteMany({})]);
  await Promise.all([
    companies.length ? Company.insertMany(companies) : null,
    students.length ? Student.insertMany(students) : null,
    rooms.length ? Room.insertMany(rooms) : null,
  ]);
}

/** Replaces the entire interview set (used right after a fresh schedule build). */
export async function saveInterviews(interviews) {
  await Interview.deleteMany({});
  if (interviews.length) {
    // strip any lean/mongo-internal fields that might have hitched a ride
    const docs = interviews.map(({ _id, __v, ...rest }) => rest);
    await Interview.insertMany(docs);
  }
}

/** Upserts a subset of interviews (used after a replan, which only touches some). */
export async function upsertInterviews(interviews) {
  if (!interviews.length) return;
  const ops = interviews.map((iv) => {
    const { _id, __v, ...rest } = iv;
    return {
      updateOne: {
        filter: { interviewId: iv.interviewId },
        update: { $set: rest },
        upsert: true,
      },
    };
  });
  await Interview.bulkWrite(ops);
}

/** Upserts companies/students/rooms that a replan mutated in place. */
export async function upsertCompanies(companies) {
  if (!companies.length) return;
  const ops = companies.map((c) => {
    const { _id, __v, ...rest } = c;
    return { updateOne: { filter: { companyId: c.companyId }, update: { $set: rest }, upsert: true } };
  });
  await Company.bulkWrite(ops);
}

export async function upsertStudents(students) {
  if (!students.length) return;
  const ops = students.map((s) => {
    const { _id, __v, ...rest } = s;
    return { updateOne: { filter: { studentId: s.studentId }, update: { $set: rest }, upsert: true } };
  });
  await Student.bulkWrite(ops);
}

export async function upsertRooms(rooms) {
  if (!rooms.length) return;
  const ops = rooms.map((r) => {
    const { _id, __v, ...rest } = r;
    return { updateOne: { filter: { roomId: r.roomId }, update: { $set: rest }, upsert: true } };
  });
  await Room.bulkWrite(ops);
}
