import { hhmmToMin, minToHHMM } from "../utils/time.js";
import { ResourceTracker } from "./resourceTracker.js";
import { REASONS } from "./reasons.js";
import { buildSlotGrid, computeSameDayDemand } from "./scheduler.js";

const CAMPUS_CLOSE_MIN = hhmmToMin("19:00"); // hard cap: nothing runs past 7pm regardless of delay

function snapshot(iv) {
  return {
    interviewId: iv.interviewId,
    companyId: iv.companyId,
    studentId: iv.studentId,
    panelId: iv.panelId,
    roomId: iv.roomId,
    day: iv.day,
    startMin: iv.startMin,
    endMin: iv.endMin,
    status: iv.status,
    reasonCode: iv.reasonCode,
  };
}

function fmt(iv) {
  if (!iv || iv.startMin == null) return null;
  return `Day ${iv.day} ${minToHHMM(iv.startMin)}-${minToHHMM(iv.endMin)} · ${iv.roomId} · ${iv.panelId}`;
}

/**
 * Core replan policy (see README §"How much reshuffling is acceptable"):
 * a replan may ONLY touch interviews that are directly invalidated by the
 * disruption (plus, for a delay/panel-drop, the rest of THAT SAME
 * company's own remaining interviews that day — never another company's).
 * Nothing else in the schedule is re-optimized or re-packed. This keeps
 * churn proportional to the disruption instead of proportional to the
 * whole day's schedule.
 */
export function replan({ companies, students, rooms, interviews }, disruption) {
  const companyById = new Map(companies.map((c) => [c.companyId, c]));
  const studentById = new Map(students.map((s) => [s.studentId, s]));
  const roomById = new Map(rooms.map((r) => [r.roomId, r]));

  const touched = new Map(); // interviewId -> {before, after}
  const notify = { students: new Set(), companies: new Set(), coordinatorNotes: [] };

  function markTouched(iv) {
    if (!touched.has(iv.interviewId)) {
      touched.set(iv.interviewId, { before: snapshot(iv), after: null });
    }
  }
  function finalizeTouched(iv) {
    const entry = touched.get(iv.interviewId);
    if (entry) entry.after = snapshot(iv);
    notify.students.add(iv.studentId);
    notify.companies.add(iv.companyId);
  }

  switch (disruption.type) {
    case "company_delay":
      handleCompanyDelay(disruption.payload);
      break;
    case "panel_drop":
      handlePanelDrop(disruption.payload);
      break;
    case "student_withdraw":
      handleStudentWithdraw(disruption.payload);
      break;
    case "room_unavailable":
      handleRoomUnavailable(disruption.payload);
      break;
    default:
      throw new Error(`Unknown disruption type: ${disruption.type}`);
  }

  // ---- handlers -------------------------------------------------------

  function handleCompanyDelay({ companyId, delayMinutes }) {
    const company = companyById.get(companyId);
    if (!company) throw new Error(`Unknown company ${companyId}`);
    if (delayMinutes <= 0) throw new Error("delayMinutes must be positive");

    company.status = "delayed";
    company.delayMinutes = (company.delayMinutes || 0) + delayMinutes;

    const originalWindowStart = hhmmToMin(company.windowStart);
    const newWindowStart = originalWindowStart + delayMinutes;
    // Company works a bit later to try to recover lost interviews, capped
    // at campus closing time — the delay is absorbed by the company's own
    // day getting compressed/extended, never by moving anyone else.
    const desiredWindowEnd = Math.min(
      hhmmToMin(company.windowEnd) + delayMinutes,
      CAMPUS_CLOSE_MIN
    );
    company.windowStart = minToHHMM(newWindowStart);
    company.windowEnd = minToHHMM(desiredWindowEnd);

    const affected = interviews.filter(
      (iv) => iv.companyId === companyId && iv.status === "scheduled"
    );
    for (const iv of affected) markTouched(iv);

    const excludeIds = new Set(affected.map((iv) => iv.interviewId));
    const tracker = ResourceTracker.fromInterviews(interviews, { excludeIds });

    const { grid } = buildSlotGrid(company);

    // Re-place in original start-time order, trying to keep each interview
    // on its ORIGINAL panel first (same panel = same interviewer, least
    // disruptive to the company's own logistics), earliest available slot.
    affected.sort((a, b) => a.startMin - b.startMin);

    for (const iv of affected) {
      const student = studentById.get(iv.studentId);
      const originalPanelId = iv.panelId;
      const originalRoomId = iv.roomId;

      let placedSlot = null;
      // Pass 1: same panel only.
      for (const slot of grid.filter((s) => s.panelId === originalPanelId)) {
        if (slot.start < newWindowStart) continue;
        if (!tracker.isPanelFree(company.day, slot.panelId, slot.start, slot.end)) continue;
        if (student.status !== "active") continue;
        if (!tracker.isStudentFree(company.day, iv.studentId, slot.start, slot.end)) continue;
        const roomId = tracker.findFreeRoom(company.day, rooms, slot.start, slot.end, originalRoomId);
        if (!roomId) continue;
        placedSlot = { ...slot, roomId };
        break;
      }
      // Pass 2: any active panel of this company (panel got reshuffled internally).
      if (!placedSlot) {
        for (const slot of grid) {
          if (slot.start < newWindowStart) continue;
          if (!tracker.isPanelFree(company.day, slot.panelId, slot.start, slot.end)) continue;
          if (student.status !== "active") continue;
          if (!tracker.isStudentFree(company.day, iv.studentId, slot.start, slot.end)) continue;
          const roomId = tracker.findFreeRoom(company.day, rooms, slot.start, slot.end, originalRoomId);
          if (!roomId) continue;
          placedSlot = { ...slot, roomId };
          break;
        }
      }

      if (placedSlot) {
        tracker.book("panel", company.day, placedSlot.panelId, placedSlot.start, placedSlot.end, iv.interviewId);
        tracker.book("student", company.day, iv.studentId, placedSlot.start, placedSlot.end, iv.interviewId);
        tracker.book("room", company.day, placedSlot.roomId, placedSlot.start, placedSlot.end, iv.interviewId);
        tracker.panelCurrentRoom.set(placedSlot.panelId, placedSlot.roomId);

        const moved = placedSlot.start !== iv.startMin || placedSlot.roomId !== iv.roomId || placedSlot.panelId !== iv.panelId;
        iv.panelId = placedSlot.panelId;
        iv.roomId = placedSlot.roomId;
        iv.startMin = placedSlot.start;
        iv.endMin = placedSlot.end;
        iv.status = "scheduled";
        iv.reasonCode = null;
        iv.reasonDetail = null;
        if (moved) {
          iv.version += 1;
          iv.lastChangeType = "moved";
        }
      } else {
        iv.panelId = null;
        iv.roomId = null;
        iv.startMin = null;
        iv.endMin = null;
        iv.status = "unscheduled";
        iv.reasonCode = REASONS.NO_ALTERNATE_FOUND;
        iv.reasonDetail = `${company.name} arrived ${delayMinutes}min late on Day ${company.day}; no slot remained (within extended hours, capped at ${minToHHMM(
          CAMPUS_CLOSE_MIN
        )}) for ${student.name} (${student.studentId}).`;
        iv.version += 1;
        iv.lastChangeType = "cancelled";
      }
      finalizeTouched(iv);
    }

    notify.coordinatorNotes.push(
      `${company.name} delayed ${delayMinutes}min on Day ${company.day}: window now ${company.windowStart}-${company.windowEnd}. ` +
        `${affected.filter((iv) => iv.status === "scheduled").length}/${affected.length} of its interviews stayed scheduled (re-timed); ` +
        `${affected.filter((iv) => iv.status === "unscheduled").length} could not be salvaged.`
    );
  }

  function handlePanelDrop({ companyId, panelId }) {
    const company = companyById.get(companyId);
    if (!company) throw new Error(`Unknown company ${companyId}`);
    const panel = company.panels.find((p) => p.panelId === panelId);
    if (!panel) throw new Error(`Unknown panel ${panelId}`);
    panel.active = false;

    const affected = interviews.filter(
      (iv) => iv.panelId === panelId && iv.status === "scheduled"
    );
    for (const iv of affected) markTouched(iv);

    const excludeIds = new Set(affected.map((iv) => iv.interviewId));
    const tracker = ResourceTracker.fromInterviews(interviews, { excludeIds });
    const { grid } = buildSlotGrid(company); // buildSlotGrid already skips inactive panels

    affected.sort((a, b) => a.startMin - b.startMin);

    for (const iv of affected) {
      const student = studentById.get(iv.studentId);
      let placedSlot = null;
      for (const slot of grid) {
        if (!tracker.isPanelFree(company.day, slot.panelId, slot.start, slot.end)) continue;
        if (student.status !== "active") continue;
        if (!tracker.isStudentFree(company.day, iv.studentId, slot.start, slot.end)) continue;
        const roomId = tracker.findFreeRoom(company.day, rooms, slot.start, slot.end, iv.roomId);
        if (!roomId) continue;
        placedSlot = { ...slot, roomId };
        break;
      }

      if (placedSlot) {
        tracker.book("panel", company.day, placedSlot.panelId, placedSlot.start, placedSlot.end, iv.interviewId);
        tracker.book("student", company.day, iv.studentId, placedSlot.start, placedSlot.end, iv.interviewId);
        tracker.book("room", company.day, placedSlot.roomId, placedSlot.start, placedSlot.end, iv.interviewId);
        tracker.panelCurrentRoom.set(placedSlot.panelId, placedSlot.roomId);

        iv.panelId = placedSlot.panelId;
        iv.roomId = placedSlot.roomId;
        iv.startMin = placedSlot.start;
        iv.endMin = placedSlot.end;
        iv.status = "scheduled";
        iv.reasonCode = null;
        iv.reasonDetail = null;
        iv.version += 1;
        iv.lastChangeType = "moved";
      } else {
        iv.panelId = null;
        iv.roomId = null;
        iv.startMin = null;
        iv.endMin = null;
        iv.status = "unscheduled";
        iv.reasonCode = REASONS.PANEL_UNAVAILABLE;
        iv.reasonDetail = `Panel ${panelId} dropped out; remaining panels of ${company.name} had no free capacity for ${student.name} (${student.studentId}) on Day ${company.day}.`;
        iv.version += 1;
        iv.lastChangeType = "cancelled";
      }
      finalizeTouched(iv);
    }

    notify.coordinatorNotes.push(
      `${panel.name} (${panelId}) of ${company.name} dropped out: ${
        affected.filter((iv) => iv.status === "scheduled").length
      }/${affected.length} of its interviews were absorbed by the remaining panels; ${
        affected.filter((iv) => iv.status === "unscheduled").length
      } could not be placed.`
    );
  }

  function handleStudentWithdraw({ studentId, reason, backfill = false }) {
    const student = studentById.get(studentId);
    if (!student) throw new Error(`Unknown student ${studentId}`);
    student.status = "withdrawn";
    student.withdrawnReason = reason || "Withdrew (offer accepted elsewhere)";
    student.withdrawnAt = new Date();

    const affected = interviews.filter(
      (iv) => iv.studentId === studentId && iv.status === "scheduled"
    );
    const freedSlots = [];
    for (const iv of affected) {
      markTouched(iv);
      freedSlots.push({
        companyId: iv.companyId,
        panelId: iv.panelId,
        roomId: iv.roomId,
        day: iv.day,
        start: iv.startMin,
        end: iv.endMin,
      });
      iv.status = "cancelled";
      iv.reasonCode = REASONS.STUDENT_WITHDRAWN;
      iv.reasonDetail = `${student.name} (${student.studentId}) withdrew: ${student.withdrawnReason}.`;
      iv.panelId = null;
      iv.roomId = null;
      iv.startMin = null;
      iv.endMin = null;
      iv.version += 1;
      iv.lastChangeType = "cancelled";
      finalizeTouched(iv);
    }

    const backfilled = [];
    if (backfill) {
      const tracker = ResourceTracker.fromInterviews(interviews, {});
      const companyDayDemand = computeSameDayDemand(students, companyById);

      for (const freed of freedSlots) {
        const company = companyById.get(freed.companyId);
        if (!company) continue;
        const dayDemand = companyDayDemand.get(company.day) || new Map();
        // best previously-unscheduled, eligible, active student for this company
        const waiting = interviews
          .filter(
            (iv) =>
              iv.companyId === freed.companyId &&
              iv.status === "unscheduled" &&
              studentById.get(iv.studentId)?.status === "active"
          )
          .sort(
            (a, b) => (dayDemand.get(b.studentId) || 0) - (dayDemand.get(a.studentId) || 0)
          );

        for (const candidate of waiting) {
          const cs = studentById.get(candidate.studentId);
          if (!tracker.isStudentFree(freed.day, cs.studentId, freed.start, freed.end)) continue;
          if (!tracker.isPanelFree(freed.day, freed.panelId, freed.start, freed.end)) continue;
          if (!tracker.isRoomFree(freed.day, freed.roomId, freed.start, freed.end)) continue;

          markTouched(candidate);
          tracker.book("student", freed.day, cs.studentId, freed.start, freed.end, candidate.interviewId);
          tracker.book("panel", freed.day, freed.panelId, freed.start, freed.end, candidate.interviewId);
          tracker.book("room", freed.day, freed.roomId, freed.start, freed.end, candidate.interviewId);

          candidate.panelId = freed.panelId;
          candidate.roomId = freed.roomId;
          candidate.startMin = freed.start;
          candidate.endMin = freed.end;
          candidate.status = "scheduled";
          candidate.reasonCode = null;
          candidate.reasonDetail = null;
          candidate.version += 1;
          candidate.lastChangeType = "reinstated";
          finalizeTouched(candidate);
          backfilled.push(candidate.interviewId);
          break;
        }
      }
    }

    notify.coordinatorNotes.push(
      `${student.name} (${studentId}) withdrew: ${affected.length} interview(s) cancelled, freeing ${affected.length} slot(s) across ${
        new Set(affected.map((a) => a.companyId)).size
      } companies.` + (backfill ? ` ${backfilled.length} freed slot(s) backfilled from the waitlist.` : " No backfill requested — slots left open by design (minimizes churn).")
    );
  }

  function handleRoomUnavailable({ roomId, reason, day = null, fromMin = null }) {
    const room = roomById.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    room.unavailable = true;
    room.unavailableReason = reason || "Room unavailable";
    room.unavailableDay = day;
    room.unavailableFrom = fromMin != null ? minToHHMM(fromMin) : null;

    const affected = interviews.filter((iv) => {
      if (iv.roomId !== roomId || iv.status !== "scheduled") return false;
      if (day != null && iv.day !== day) return false;
      if (fromMin != null && iv.startMin < fromMin) return false;
      return true;
    });
    for (const iv of affected) markTouched(iv);

    const excludeIds = new Set(affected.map((iv) => iv.interviewId));
    const tracker = ResourceTracker.fromInterviews(interviews, { excludeIds });
    const availableRooms = rooms.filter((r) => r.roomId !== roomId);

    for (const iv of affected) {
      const company = companyById.get(iv.companyId);
      const student = studentById.get(iv.studentId);

      // Minimal-disturbance pass 1: same time, same panel, different room.
      let newRoomId = tracker.findFreeRoom(iv.day, availableRooms, iv.startMin, iv.endMin, null);

      if (newRoomId) {
        tracker.book("room", iv.day, newRoomId, iv.startMin, iv.endMin, iv.interviewId);
        tracker.book("panel", iv.day, iv.panelId, iv.startMin, iv.endMin, iv.interviewId);
        tracker.book("student", iv.day, iv.studentId, iv.startMin, iv.endMin, iv.interviewId);
        iv.roomId = newRoomId;
        iv.status = "scheduled";
        iv.reasonCode = null;
        iv.reasonDetail = null;
        iv.version += 1;
        iv.lastChangeType = "moved";
      } else if (company) {
        // Pass 2: same panel, a different (still in-window) time, any room.
        const { grid } = buildSlotGrid(company);
        let placedSlot = null;
        for (const slot of grid.filter((s) => s.panelId === iv.panelId)) {
          if (!tracker.isPanelFree(iv.day, slot.panelId, slot.start, slot.end)) continue;
          if (!tracker.isStudentFree(iv.day, iv.studentId, slot.start, slot.end)) continue;
          const roomId = tracker.findFreeRoom(iv.day, availableRooms, slot.start, slot.end, null);
          if (!roomId) continue;
          placedSlot = { ...slot, roomId };
          break;
        }
        if (placedSlot) {
          tracker.book("panel", iv.day, placedSlot.panelId, placedSlot.start, placedSlot.end, iv.interviewId);
          tracker.book("student", iv.day, iv.studentId, placedSlot.start, placedSlot.end, iv.interviewId);
          tracker.book("room", iv.day, placedSlot.roomId, placedSlot.start, placedSlot.end, iv.interviewId);
          iv.roomId = placedSlot.roomId;
          iv.startMin = placedSlot.start;
          iv.endMin = placedSlot.end;
          iv.status = "scheduled";
          iv.reasonCode = null;
          iv.reasonDetail = null;
          iv.version += 1;
          iv.lastChangeType = "moved";
        } else {
          iv.status = "unscheduled";
          iv.roomId = null;
          iv.startMin = null;
          iv.endMin = null;
          iv.reasonCode = REASONS.ROOM_UNAVAILABLE;
          iv.reasonDetail = `${roomId} became unavailable (${room.unavailableReason}); no alternate room or slot found for ${student.name} (${student.studentId}) with ${company.name}.`;
          iv.version += 1;
          iv.lastChangeType = "cancelled";
        }
      }
      finalizeTouched(iv);
    }

    notify.coordinatorNotes.push(
      `${roomId} marked unavailable (${room.unavailableReason}): ${
        affected.filter((iv) => iv.status === "scheduled").length
      }/${affected.length} interviews relocated; ${
        affected.filter((iv) => iv.status === "unscheduled").length
      } could not be salvaged.`
    );
  }

  // ---- build diff -------------------------------------------------------
  const moved = [];
  const cancelled = [];
  const reinstated = [];
  for (const [interviewId, { before, after }] of touched) {
    if (!after) continue;
    if (after.status === "cancelled" || after.status === "unscheduled") {
      cancelled.push({ interviewId, before, after });
    } else if (before.status !== "scheduled" && after.status === "scheduled") {
      reinstated.push({ interviewId, before, after });
    } else if (
      before.startMin !== after.startMin ||
      before.roomId !== after.roomId ||
      before.panelId !== after.panelId
    ) {
      moved.push({
        interviewId,
        before: fmt(before),
        after: fmt(after),
        studentId: after.studentId,
        companyId: after.companyId,
      });
    }
  }

  const scheduledBeforeCount = [...touched.values()].filter((t) => t.before.status === "scheduled").length;
  const churnCount = moved.length + cancelled.filter((c) => c.before.status === "scheduled").length;
  const churnRate = scheduledBeforeCount === 0 ? 0 : churnCount / scheduledBeforeCount;

  const diff = {
    disruptionType: disruption.type,
    payload: disruption.payload,
    moved,
    cancelled: cancelled.map((c) => ({
      interviewId: c.interviewId,
      studentId: c.after.studentId,
      companyId: c.after.companyId,
      reasonCode: c.after.reasonCode,
      wasAt: fmt(c.before),
    })),
    reinstated: reinstated.map((r) => ({
      interviewId: r.interviewId,
      studentId: r.after.studentId,
      companyId: r.after.companyId,
      now: fmt(r.after),
    })),
    totalTouched: touched.size,
    affectedStudents: [...notify.students],
    affectedCompanies: [...notify.companies],
    coordinatorNotes: notify.coordinatorNotes,
    churn: {
      previouslyScheduled: scheduledBeforeCount,
      changedCount: churnCount,
      churnRate: Math.round(churnRate * 1000) / 1000,
    },
  };

  return { companies, students, rooms, interviews, diff };
}
