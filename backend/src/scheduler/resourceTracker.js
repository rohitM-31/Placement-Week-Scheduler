import { overlaps } from "../utils/time.js";

/**
 * Tracks busy intervals per (kind, day, resourceId) for students, rooms and
 * panels, and lets the scheduler/replanner do fast overlap checks + bookings.
 * Shared by the initial solver and the replanner so "is this slot actually
 * free" always means the same thing in both places.
 */
export class ResourceTracker {
  constructor() {
    this.busy = { student: new Map(), room: new Map(), panel: new Map() };
    this.panelCurrentRoom = new Map(); // panelId -> last-used roomId (soft preference)
  }

  _bucket(kind, day, id) {
    const map = this.busy[kind];
    if (!map.has(day)) map.set(day, new Map());
    const dayMap = map.get(day);
    if (!dayMap.has(id)) dayMap.set(id, []);
    return dayMap.get(id);
  }

  isFree(kind, day, id, start, end, ignoreInterviewId = null) {
    const list = this._bucket(kind, day, id);
    return !list.some(
      (iv) => iv.interviewId !== ignoreInterviewId && overlaps(start, end, iv.start, iv.end)
    );
  }

  book(kind, day, id, start, end, interviewId) {
    this._bucket(kind, day, id).push({ start, end, interviewId });
  }

  release(kind, day, id, interviewId) {
    const list = this._bucket(kind, day, id);
    const i = list.findIndex((iv) => iv.interviewId === interviewId);
    if (i >= 0) list.splice(i, 1);
  }

  isStudentFree(day, studentId, start, end, ignore = null) {
    return this.isFree("student", day, studentId, start, end, ignore);
  }
  isRoomFree(day, roomId, start, end, ignore = null) {
    return this.isFree("room", day, roomId, start, end, ignore);
  }
  isPanelFree(day, panelId, start, end, ignore = null) {
    return this.isFree("panel", day, panelId, start, end, ignore);
  }

  // Find any free room from `roomPool` for [start,end) on `day`, preferring
  // the panel's current room (fewer room-hops during the day = realistic).
  findFreeRoom(day, roomPool, start, end, preferredRoomId, ignoreInterviewId = null) {
    if (preferredRoomId) {
      const preferred = roomPool.find((r) => r.roomId === preferredRoomId && !r.unavailable);
      if (preferred && this.isRoomFree(day, preferred.roomId, start, end, ignoreInterviewId)) {
        return preferred.roomId;
      }
    }
    for (const room of roomPool) {
      if (room.unavailable) continue;
      if (this.isRoomFree(day, room.roomId, start, end, ignoreInterviewId)) {
        return room.roomId;
      }
    }
    return null;
  }

  /** Bulk-load every currently scheduled interview into the tracker. */
  static fromInterviews(interviews, { excludeIds = new Set() } = {}) {
    const tracker = new ResourceTracker();
    for (const iv of interviews) {
      if (iv.status !== "scheduled") continue;
      if (excludeIds.has(iv.interviewId)) continue;
      tracker.book("student", iv.day, iv.studentId, iv.startMin, iv.endMin, iv.interviewId);
      tracker.book("room", iv.day, iv.roomId, iv.startMin, iv.endMin, iv.interviewId);
      tracker.book("panel", iv.day, iv.panelId, iv.startMin, iv.endMin, iv.interviewId);
      tracker.panelCurrentRoom.set(iv.panelId, iv.roomId);
    }
    return tracker;
  }
}
