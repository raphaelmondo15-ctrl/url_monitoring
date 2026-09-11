import { Router } from "express";
import { createMonitor } from "../controllers/monitor.controller.js";

const router = Router();

router.post("/", createMonitor);

export default router;