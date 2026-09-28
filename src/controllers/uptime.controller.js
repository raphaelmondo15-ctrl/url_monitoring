import { uptimeQuerySchema } from "../schemas/uptime.schema.js";
import { getMonitorUptime } from "../services/uptime.service.js";

export async function getMonitorUptimeReport(req, res, next) {
    try {
        const monitorId = Number(req.params.id);

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