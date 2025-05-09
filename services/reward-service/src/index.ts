import express from "express";
import complete from "./routes/complete";
import health from "./routes/health";
import ethereum from "./routes/ethereum";

const app = express();
app.use(express.json());
app.use("/reward/complete", complete);
app.use("/healthz", health);
app.use("/ethereum", ethereum);
app.listen(8080, () => console.log("reward-service on :8080"));
