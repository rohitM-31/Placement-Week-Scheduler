import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    branch: { type: String, required: true },
    cgpa: { type: Number, required: true },

    // companyIds that shortlisted this student. Popular students appear on
    // many overlapping lists — that overlap is the main source of conflict
    // the scheduler has to resolve.
    shortlistedBy: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["active", "placed", "withdrawn"],
      default: "active",
    },
    withdrawnAt: { type: Date },
    withdrawnReason: { type: String },
    placedByCompanyId: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Student", StudentSchema);
