import express from 'express';
import { getMonitorUptimeReport } from '../controllers/uptime.controller.js';

const router = express.Router();

router.get('/:id/uptime', getMonitorUptimeReport);

export default router;