import { getMonitorChecks } from "../controllers/check.controller.js";
import express from 'express';

const router = express.Router();

router.get("/:id/checks", getMonitorChecks);

export default router;
