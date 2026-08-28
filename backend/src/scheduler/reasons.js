// Centralized "why couldn't we schedule this" reason codes. The assignment
// is explicit that the system must never fail silently, so every unscheduled
// interview always carries one of these plus a human-readable detail string.
export const REASONS = {
  CAPACITY_EXHAUSTED: "CAPACITY_EXHAUSTED",
  STUDENT_CONFLICT: "STUDENT_CONFLICT",
  ROOM_SHORTAGE: "ROOM_SHORTAGE",
  STUDENT_WITHDRAWN: "STUDENT_WITHDRAWN",
  COMPANY_CANCELLED: "COMPANY_CANCELLED",
  PANEL_UNAVAILABLE: "PANEL_UNAVAILABLE",
  ROOM_UNAVAILABLE: "ROOM_UNAVAILABLE",
  NO_ALTERNATE_FOUND: "NO_ALTERNATE_FOUND",
};

export const REASON_LABELS = {
  CAPACITY_EXHAUSTED:
    "Company ran out of interview slots that day (more shortlisted candidates than panel-hours available).",
  STUDENT_CONFLICT:
    "Student already has an overlapping interview at every remaining available slot for this company.",
  ROOM_SHORTAGE:
    "A panel slot and a free student were available, but no room could be secured at any matching time.",
  STUDENT_WITHDRAWN: "Student withdrew before this interview could take place.",
  COMPANY_CANCELLED: "Company cancelled its visit.",
  PANEL_UNAVAILABLE: "The assigned panel dropped out and no replacement panel had capacity.",
  ROOM_UNAVAILABLE: "The assigned room became unavailable and no alternate room was found in time.",
  NO_ALTERNATE_FOUND: "A disruption invalidated this interview and no feasible alternate slot exists.",
};
