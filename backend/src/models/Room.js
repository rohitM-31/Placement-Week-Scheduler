import mongoose from "mongoose";

const RoomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    building: { type: String, default: "Main Block" },
    floor: { type: Number, default: 1 },
    capacity: { type: Number, default: 1 }, // concurrent interviews it can host (usually 1)

    // Set on a room-unavailable disruption (AC failure, double-booked with
    // an exam, etc). Optionally scoped to a day/time window.
    unavailable: { type: Boolean, default: false },
    unavailableReason: { type: String },
    unavailableFrom: { type: String }, // "HH:MM"
    unavailableDay: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.model("Room", RoomSchema);
