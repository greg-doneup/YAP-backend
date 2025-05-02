// src/routes/health.ts
import { Router } from "express";
const router = Router();

router.get("/", (_req, res) => res.send("ok"));

export default router;
