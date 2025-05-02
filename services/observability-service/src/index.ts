import express from "express";
import dotenv from "dotenv";
import ingest from "./routes/ingest";
import billing from "./routes/billing";
import health from "./routes/health";
import { registry, requests } from "./metrics";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

/* Prometheus scrape endpoint */
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

app.use("/usage/event", ingest);
app.use("/billing",      billing);
app.use("/healthz",      health);

/* Request counter middleware */
app.use((req, res, next) => {
  res.on("finish", () =>
    requests.inc({ route: req.path, code: res.statusCode }),
  );
  next();
});

app.listen(PORT, () => console.log("observability-service on :" + PORT));
