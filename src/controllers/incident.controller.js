import { getIncidents, getIncidentsByMonitorId } from "../services/incident.service.js";
import { getMonitorById } from "../services/monitor.service.js";

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

        const monitor = await getMonitorById(monitorId);

if (!monitor) {
    return res.status(404).json({
        error: "Monitor not found",
    });
}

        const incidents = await getIncidentsByMonitorId(monitorId);

        res.status(200).json({
            items: incidents
        });
    } catch (error) {
        next(error);
    }
}
