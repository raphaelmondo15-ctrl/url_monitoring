import { getChecksByMonitorId } from "../services/check.service.js";

export async function getMonitorChecks(req, res, next) {
    try {
        const monitorId = Number(req.params.id);

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
