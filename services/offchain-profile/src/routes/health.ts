import { Router } from "express";
const router = Router();

// Health check route for Kubernetes readiness probe
router.get("/", (_req, res) => res.send("ok"));

export default router;
