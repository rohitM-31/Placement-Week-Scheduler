import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import connectDB from "./src/config/db.js";
import routes from "./src/routes/index.js";

const PORT = process.env.PORT || 4000;

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan("dev"));

  app.use("/api", routes);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });

  await connectDB();

  app.listen(PORT, () => {
    console.log(`[server] Mirai Labs Placement Scheduler API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[server] fatal startup error:", err);
  process.exit(1);
});
