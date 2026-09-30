import { getChecksByMonitorId } from "../services/check.service.js";
import { getMonitorById } from "../services/monitor.service.js";
import idSchema from "../schemas/id.schema.js";
import { paginationSchema } from "../schemas/pagination.schema.js";

export async function getMonitorChecks(req, res, next) {
    try {
        const monitorId = idSchema.parse(Number(req.params.id));

        const monitor = await getMonitorById(monitorId);

if (!monitor) {
    return res.status(404).json({
        error: "Monitor not found",
    });
}

        const { after, limit } = paginationSchema.parse(req.query);

        const result = await getChecksByMonitorId(
            monitorId,
            { after, limit }
        );

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

export async function exportMonitorChecksCsv(req, res, next) {
    try {
        const monitorId = idSchema.parse(Number(req.params.id));

        const monitor = await getMonitorById(monitorId);

if (!monitor) {
    return res.status(404).json({
        error: "Monitor not found",
    });
}

        res.status(200);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="monitor-${monitorId}-checks.csv"`
        );

        res.write("id,monitor_id,checked_at,ok,status_code,latency_ms,error\n");

        const result = await getChecksByMonitorId(
            monitorId,
            { after: undefined, limit: 10000 }
        );

        for (const check of result.items) {
            res.write(
                `${check.id},${check.monitor_id},${check.checked_at},${check.ok},${check.status_code ?? ""},${check.latency_ms ?? ""},"${(check.error ?? "").replaceAll('"', '""')}"\n`
            );
        }

        res.end();
    } catch (error) {
        next(error);
    }
}
