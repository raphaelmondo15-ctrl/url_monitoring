import express from "express";
import { getMonitorIncidents } from "../controllers/incident.controller.js";

const router = express.Router();

router.get("/:id/incidents", getMonitorIncidents);

export default router;