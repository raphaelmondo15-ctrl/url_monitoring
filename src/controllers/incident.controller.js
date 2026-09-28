import { getIncidents, getIncidentsByMonitorId } from "../services/incident.service.js";

export async function getAllIncidents(req, res, next) {
    try {
        const incidents = await getIncidents();

        res.status(200).json({ items: incidents });
    } catch (error) {
        next(error);
    }
}

export async function getMonitorIncidents(req, res, next) {
    try {
        const monitorId = Number(req.params.id);

        const incidents = await getIncidentsByMonitorId(monitorId);

        res.status(200).json({
            items: incidents
        });
    } catch (error) {
        next(error);
    }
}
