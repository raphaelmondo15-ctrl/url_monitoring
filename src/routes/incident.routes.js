import express from 'express';
import { getAllIncidents } from "../controllers/incident.controller.js";

const router = express.Router();

router.get("/", getAllIncidents);

export default router;
