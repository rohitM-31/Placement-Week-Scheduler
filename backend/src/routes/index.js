import { Router } from "express";
import { generateDatasetHandler } from "../controllers/datasetController.js";
import { rebuildScheduleHandler, dashboardHandler } from "../controllers/scheduleController.js";
import {
  listCompanies,
  listStudents,
  listRooms,
  listInterviews,
  listUnscheduled,
} from "../controllers/entityController.js";
import {
  companyDelay,
  panelDrop,
  studentWithdraw,
  roomUnavailable,
  disruptionLog,
} from "../controllers/disruptionController.js";

const router = Router();

router.get("/health", (req, res) => res.json({ ok: true }));

router.post("/dataset/generate", generateDatasetHandler);

router.post("/schedule/rebuild", rebuildScheduleHandler);
router.get("/dashboard", dashboardHandler);

router.get("/companies", listCompanies);
router.get("/students", listStudents);
router.get("/rooms", listRooms);
router.get("/interviews", listInterviews);
router.get("/interviews/unscheduled", listUnscheduled);

router.post("/disruptions/company-delay", companyDelay);
router.post("/disruptions/panel-drop", panelDrop);
router.post("/disruptions/student-withdraw", studentWithdraw);
router.post("/disruptions/room-unavailable", roomUnavailable);
router.get("/disruptions/log", disruptionLog);

export default router;
