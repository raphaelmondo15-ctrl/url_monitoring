import { Router } from "express";
import { createMonitor, getMonitors, getMonitorById, updateMonitor } from "../controllers/monitor.controller.js";


const router = Router();

router.post("/", createMonitor);
router.get("/", getMonitors);
router.get("/:id", getMonitorById);
router.patch("/:id", updateMonitor);

export default router;