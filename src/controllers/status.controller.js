import { getStatus } from "../services/status.service.js";

export async function getPublicStatus(req, res, next) {
    try {
        const monitors = await getStatus();

        res.status(200).json({
            monitors
        });
    } catch (error) {
        next(error);
    }
}
