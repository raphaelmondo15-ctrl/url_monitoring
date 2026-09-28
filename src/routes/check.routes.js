import { getMonitorChecks, exportMonitorChecksCsv } from "../controllers/check.controller.js";
import express from 'express';

const router = express.Router();

router.get("/:id/checks", getMonitorChecks);
router.get("/:id/checks.csv", exportMonitorChecksCsv);

export default router;
