import { getIncidents, getIncidentsByMonitorId } from "../services/incident.service.js";
import { getMonitorById } from "../services/monitor.service.js";
import idSchema from "../schemas/id.schema.js";
import { incidentPaginationSchema } from "../schemas/incident-pagination.schema.js";

export async function getAllIncidents(req, res, next) {
    try {
        const pagination = incidentPaginationSchema.parse(req.query);
        const result = await getIncidents(pagination);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

export async function getMonitorIncidents(req, res, next) {
    try {
        const monitorId = idSchema.parse(Number(req.params.id));

        const monitor = await getMonitorById(monitorId);

if (!monitor) {
    return res.status(404).json({
        error: "Monitor not found",
    });
}

        const pagination = incidentPaginationSchema.parse(req.query);
        const result = await getIncidentsByMonitorId(monitorId, pagination);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}
