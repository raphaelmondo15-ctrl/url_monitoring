import { createMonitorSchema } from "../schemas/monitor.schema.js";
import * as monitorService from "../services/monitor.service.js";
import { paginationSchema } from "../schemas/pagination.schema.js";

export async function createMonitor(req, res, next) {
    try {
        const parsed = createMonitorSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                error: parsed.error.flatten(),
            });
        }

        const monitor = await monitorService.createMonitor(parsed.data);

        res.status(201).json(monitor);
    } catch (error) {
        next(error);
    }
}

export async function getMonitors(req, res, next) {
    try {
        const parsed = paginationSchema.safeParse(req.query);

        if (!parsed.success) {
            return res.status(400).json({
                error: parsed.error.flatten(),
            });
        }

         const monitors = await monitorService.getMonitors(parsed.data);

        res.status(200).json(monitors);
    } catch (error) {
        next(error);
    }
}