import { uptimeQuerySchema } from "../schemas/uptime.schema.js";
import { getMonitorUptime } from "../services/uptime.service.js";
import { getMonitorById } from "../services/monitor.service.js";
import idSchema from "../schemas/id.schema.js";

export async function getMonitorUptimeReport(req, res, next) {
    try {
        const monitorId = idSchema.parse(Number(req.params.id));

        const monitor = await getMonitorById(monitorId);

if (!monitor) {
    return res.status(404).json({
        error: "Monitor not found",
    });
}

        const { window } = uptimeQuerySchema.parse(req.query);

        const result = await getMonitorUptime(
            monitorId,
            window
        );

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}