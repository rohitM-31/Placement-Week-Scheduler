import mongoose from "mongoose";

const PanelSchema = new mongoose.Schema(
  {
    panelId: { type: String, required: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: true }, // flips false when a panel "drops out"
  },
  { _id: false }
);

const CompanySchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, unique: true },
    name: { type: String, required: true },

    // Mass recruiters run on Day 1, niche/specialist recruiters spread across
    // days 2-4. Tier drives scheduling priority and how the system decides
    // "which constraint bends first" when things don't fit.
    tier: { type: String, enum: ["mass", "core", "niche"], required: true },
    priorityScore: { type: Number, required: true }, // higher = scheduled first / bends last

    day: { type: Number, min: 1, max: 4, required: true },
    cgpaCutoff: { type: Number, required: true },
    interviewDurationMins: { type: Number, required: true },

    panels: { type: [PanelSchema], default: [] },

    // Company's own working window that day (they don't sit all day).
    windowStart: { type: String, required: true }, // "09:00"
    windowEnd: { type: String, required: true }, // "17:30"

    // Operational status set by disruptions.
    status: {
      type: String,
      enum: ["scheduled", "delayed", "cancelled"],
      default: "scheduled",
    },
    delayMinutes: { type: Number, default: 0 },
    branchesTargeted: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Company", CompanySchema);
