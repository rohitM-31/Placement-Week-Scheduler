import mongoose from "mongoose";

const InterviewSchema = new mongoose.Schema(
  {
    interviewId: { type: String, required: true, unique: true },

    companyId: { type: String, required: true },
    studentId: { type: String, required: true },
    panelId: { type: String }, // null while unscheduled
    roomId: { type: String }, // null while unscheduled

    day: { type: Number, min: 1, max: 4, required: true },
    startMin: { type: Number }, // minutes from 00:00, null while unscheduled
    endMin: { type: Number },

    status: {
      type: String,
      enum: ["scheduled", "unscheduled", "cancelled", "completed"],
      default: "unscheduled",
    },

    // Populated whenever status === "unscheduled" or the interview was
    // cancelled by a disruption — the assignment explicitly requires the
    // system to "never fail silently".
    reasonCode: { type: String },
    reasonDetail: { type: String },

    // Bookkeeping for replan diffing / churn metric.
    version: { type: Number, default: 1 },
    lastChangeType: { type: String }, // "created" | "moved" | "cancelled" | "reinstated"
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

InterviewSchema.index({ companyId: 1, studentId: 1 }, { unique: true });

export default mongoose.model("Interview", InterviewSchema);
