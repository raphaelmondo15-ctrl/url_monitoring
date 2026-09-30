import { getChecksByMonitorId } from "../services/check.service.js";
import idSchema from "../schemas/id.schema.js";

export async function getMonitorChecks(req, res, next) {
    try {
        const monitorId = idSchema.parse(Number(req.params.id));

        const after = req.query.after !== undefined
            ? Number(req.query.after)
            : undefined;

        const limit = req.query.limit !== undefined
            ? Number(req.query.limit)
            : 20;

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
