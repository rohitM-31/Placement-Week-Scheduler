import Company from "../models/Company.js";
import Student from "../models/Student.js";
import Room from "../models/Room.js";
import Interview from "../models/Interview.js";

export async function listCompanies(req, res, next) {
  try {
    const filter = {};
    if (req.query.day) filter.day = Number(req.query.day);
    if (req.query.tier) filter.tier = req.query.tier;
    const companies = await Company.find(filter).sort({ day: 1, priorityScore: -1 }).lean();
    res.json(companies);
  } catch (err) {
    next(err);
  }
}

export async function listStudents(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.branch) filter.branch = req.query.branch;
    if (req.query.q) filter.$or = [
      { studentId: new RegExp(req.query.q, "i") },
      { name: new RegExp(req.query.q, "i") },
    ];
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort({ studentId: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);
    res.json({ students, total, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function listRooms(req, res, next) {
  try {
    const rooms = await Room.find().sort({ roomId: 1 }).lean();
    res.json(rooms);
  } catch (err) {
    next(err);
  }
}

export async function listInterviews(req, res, next) {
  try {
    const filter = {};
    if (req.query.day) filter.day = Number(req.query.day);
    if (req.query.companyId) filter.companyId = req.query.companyId;
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.roomId) filter.roomId = req.query.roomId;
    if (req.query.status) filter.status = req.query.status;
    const interviews = await Interview.find(filter).sort({ day: 1, startMin: 1 }).lean();
    res.json(interviews);
  } catch (err) {
    next(err);
  }
}

export async function listUnscheduled(req, res, next) {
  try {
    const filter = { status: "unscheduled" };
    if (req.query.day) filter.day = Number(req.query.day);
    if (req.query.reasonCode) filter.reasonCode = req.query.reasonCode;
    const interviews = await Interview.find(filter).sort({ day: 1 }).lean();
    const byReason = {};
    for (const iv of interviews) byReason[iv.reasonCode] = (byReason[iv.reasonCode] || 0) + 1;
    res.json({ interviews, byReason, count: interviews.length });
  } catch (err) {
    next(err);
  }
}
