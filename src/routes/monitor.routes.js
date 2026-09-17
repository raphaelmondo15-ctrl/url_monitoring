import { Router } from "express";
import { createMonitor, getMonitors } from "../controllers/monitor.controller.js";

const router = Router();

router.post("/", createMonitor);
router.get("/", getMonitors);

export default router;