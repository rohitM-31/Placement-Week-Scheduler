import mongoose from "mongoose";


export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (uri) {
    await mongoose.connect(uri);
    console.log(`[db] connected to MongoDB at ${uri}`);
    return { mode: "external", uri };
  }

  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mem = await MongoMemoryServer.create({
      instance: { dbName: "placement_scheduler" },
      // Pinned to a version MongoDB actually ships binaries for on Debian 12
      // (Render's build image) — the library's own default (6.0.14) 404s there.
      binary: { version: "7.0.14" },
    });
    const memUri = mem.getUri();
    await mongoose.connect(memUri);
    console.log(
      "[db] MONGODB_URI not set — started an in-memory MongoDB instance for local/demo use."
    );
    console.log(
      "[db] Data will NOT persist across restarts. Set MONGODB_URI in .env for a real deployment."
    );
    process.on("SIGINT", async () => {
      await mongoose.disconnect();
      await mem.stop();
      process.exit(0);
    });
    return { mode: "memory", uri: memUri };
  } catch (err) {
    console.error(
      "[db] No MONGODB_URI set and the in-memory MongoDB fallback failed to start.\n" +
        "     Install/run MongoDB and set MONGODB_URI in backend/.env, or ensure " +
        "     'mongodb-memory-server' installed correctly (npm install).\n",
      err.message
    );
    throw err;
  }
}

export default connectDB;
