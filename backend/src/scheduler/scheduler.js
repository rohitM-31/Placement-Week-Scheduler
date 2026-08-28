import { hhmmToMin } from "../utils/time.js";
import { ResourceTracker } from "./resourceTracker.js";
import { REASONS, REASON_LABELS } from "./reasons.js";

/**
 * Builds the slot grid for one company on its day: every (panel, slotIndex)
 * pair the panel can run, in round-robin time order (all panels' slot 0
 * before any panel's slot 1) so the search below naturally offers the
 * earliest overall time first.
 */
function buildSlotGrid(company) {
  const windowStart = hhmmToMin(company.windowStart);
  const windowEnd = hhmmToMin(company.windowEnd);
  const duration = company.interviewDurationMins;
  const maxSlots = Math.max(0, Math.floor((windowEnd - windowStart) / duration));
  const activePanels = company.panels.filter((p) => p.active);

  const grid = [];
  for (let k = 0; k < maxSlots; k++) {
    for (const panel of activePanels) {
      grid.push({
        panelId: panel.panelId,
        slotIndex: k,
        start: windowStart + k * duration,
        end: windowStart + (k + 1) * duration,
      });
    }
  }
  return { grid, maxSlots, activePanels, duration, windowStart, windowEnd };
}

/** Precompute, per day, how many same-day companies shortlisted each student. */
function computeSameDayDemand(students, companyById) {
  const demand = new Map(); // day -> studentId -> count
  for (const s of students) {
    for (const companyId of s.shortlistedBy) {
      const c = companyById.get(companyId);
      if (!c) continue;
      if (!demand.has(c.day)) demand.set(c.day, new Map());
      const dayMap = demand.get(c.day);
      dayMap.set(s.studentId, (dayMap.get(s.studentId) || 0) + 1);
    }
  }
  return demand;
}

let interviewCounter = 0;
function nextInterviewId() {
  interviewCounter += 1;
  return `IV${String(interviewCounter).padStart(6, "0")}`;
}

/**
 * Produces a full, feasible-as-possible initial schedule from scratch.
 *
 * Greedy, priority-ordered constructive solver (not a full CSP backtracker):
 * companies are processed by (day asc, priorityScore desc) so Day-1 mass
 * recruiters get first claim on rooms/panels/student time; within a
 * company, the most in-demand students (highest same-day shortlist overlap)
 * are placed first, while the most slots are still open. Every interview
 * that can't be placed is recorded with a specific machine-readable reason
 * — the solver never just drops a requirement silently.
 *
 * This is intentionally a single deterministic pass, not iterative
 * optimization: it's fast (handles thousands of interviews in well under a
 * second), reproducible for a given seed/order, and — critically for the
 * replanner — gives every interview a stable identity to diff against
 * later. See README §"What does a good schedule mean" for why we didn't
 * reach for full backtracking/ILP here.
 */
export function buildInitialSchedule({ companies, students, rooms }) {
  interviewCounter = 0;
  const tracker = new ResourceTracker();
  const companyById = new Map(companies.map((c) => [c.companyId, c]));
  const studentById = new Map(students.map((s) => [s.studentId, s]));
  const activeRooms = rooms; // room.unavailable respected inside findFreeRoom

  const sameDayDemand = computeSameDayDemand(students, companyById);

  const orderedCompanies = [...companies]
    .filter((c) => c.status !== "cancelled")
    .sort((a, b) => a.day - b.day || b.priorityScore - a.priorityScore);

  const interviews = [];

  for (const company of orderedCompanies) {
    const { grid, maxSlots, activePanels, duration } = buildSlotGrid(company);
    const totalCapacity = grid.length;

    const dayDemand = sameDayDemand.get(company.day) || new Map();
    const candidates = students
      .filter(
        (s) =>
          s.status === "active" &&
          s.shortlistedBy.includes(company.companyId) &&
          s.cgpa >= company.cgpaCutoff
      )
      .sort((a, b) => (dayDemand.get(b.studentId) || 0) - (dayDemand.get(a.studentId) || 0));

    for (const student of candidates) {
      let placed = null;

      for (const slot of grid) {
        if (!tracker.isPanelFree(company.day, slot.panelId, slot.start, slot.end)) continue;
        if (!tracker.isStudentFree(company.day, student.studentId, slot.start, slot.end)) continue;

        const preferred = tracker.panelCurrentRoom.get(slot.panelId);
        const roomId = tracker.findFreeRoom(
          company.day,
          activeRooms,
          slot.start,
          slot.end,
          preferred
        );
        if (!roomId) continue; // this slot's capacity stays open; try next slot

        // Commit.
        const interviewId = nextInterviewId();
        tracker.book("panel", company.day, slot.panelId, slot.start, slot.end, interviewId);
        tracker.book("student", company.day, student.studentId, slot.start, slot.end, interviewId);
        tracker.book("room", company.day, roomId, slot.start, slot.end, interviewId);
        tracker.panelCurrentRoom.set(slot.panelId, roomId);

        placed = {
          interviewId,
          companyId: company.companyId,
          studentId: student.studentId,
          panelId: slot.panelId,
          roomId,
          day: company.day,
          startMin: slot.start,
          endMin: slot.end,
          status: "scheduled",
          reasonCode: null,
          reasonDetail: null,
          version: 1,
          lastChangeType: "created",
          history: [],
        };
        interviews.push(placed);
        break;
      }

      if (!placed) {
        const remaining = grid.filter((s) =>
          tracker.isPanelFree(company.day, s.panelId, s.start, s.end)
        );
        let reasonCode, reasonDetail;

        if (remaining.length === 0) {
          reasonCode = REASONS.CAPACITY_EXHAUSTED;
          reasonDetail = `${company.name}: all ${totalCapacity} interview slots (${activePanels.length} panels × ${maxSlots} slots × ${duration}min) on Day ${company.day} are filled.`;
        } else {
          const studentHasFreeSlot = remaining.some((s) =>
            tracker.isStudentFree(company.day, student.studentId, s.start, s.end)
          );
          if (!studentHasFreeSlot) {
            reasonCode = REASONS.STUDENT_CONFLICT;
            reasonDetail = `${student.name} (${student.studentId}) already has an overlapping interview at every remaining ${company.name} slot on Day ${company.day}.`;
          } else {
            reasonCode = REASONS.ROOM_SHORTAGE;
            reasonDetail = `No room was free for ${student.name} (${student.studentId}) at any remaining ${company.name} slot on Day ${company.day} — all ${rooms.length} rooms booked at those times.`;
          }
        }

        interviews.push({
          interviewId: nextInterviewId(),
          companyId: company.companyId,
          studentId: student.studentId,
          panelId: null,
          roomId: null,
          day: company.day,
          startMin: null,
          endMin: null,
          status: "unscheduled",
          reasonCode,
          reasonDetail,
          version: 1,
          lastChangeType: "created",
          history: [],
        });
      }
    }
  }

  return { interviews, tracker };
}

export { buildSlotGrid, computeSameDayDemand, REASON_LABELS };
