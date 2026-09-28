import { getIncidents } from "../services/incident.service.js";

export async function getAllIncidents(req, res, next) {
    try {
        const incidents = await getIncidents();

        res.status(200).json({ items: incidents });
    } catch (error) {
        next(error);
    }
}
