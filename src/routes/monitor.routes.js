import { Router } from "express";
import { createMonitor, getMonitors, getMonitorById } from "../controllers/monitor.controller.js";


const router = Router();

router.post("/", createMonitor);
router.get("/", getMonitors);
router.get("/:id", getMonitorById);

export default router;