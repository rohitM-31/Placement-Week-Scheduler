import mongoose from "mongoose";

const DisruptionLogSchema = new mongoose.Schema(
  {
    disruptionId: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: ["company_delay", "panel_drop", "student_withdraw", "room_unavailable"],
      required: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed },
    diff: { type: mongoose.Schema.Types.Mixed }, // full diff returned to the coordinator
    metrics: { type: mongoose.Schema.Types.Mixed }, // metrics snapshot after replan
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("DisruptionLog", DisruptionLogSchema);
