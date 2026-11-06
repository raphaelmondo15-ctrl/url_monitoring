import {
    getChecksByMonitorId,
    streamChecksByMonitorId,
} from "../services/check.service.js";
import { getMonitorById } from "../services/monitor.service.js";
import idSchema from "../schemas/id.schema.js";
import { paginationSchema } from "../schemas/pagination.schema.js";

const csvHeader = "id,monitor_id,checked_at,ok,status_code,latency_ms,error\n";

function formatCheckAsCsv(check) {
    const escapedError = (check.error ?? "").replaceAll('"', '""');

    return `${check.id},${check.monitor_id},${check.checked_at},${check.ok},${check.status_code ?? ""},${check.latency_ms ?? ""},"${escapedError}"\n`;
}

function waitForDrainOrClose(res, signal) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            res.removeListener("drain", onDrain);
            res.removeListener("error", onError);
            signal.removeEventListener("abort", onAbort);
        };
        const onDrain = () => {
            cleanup();
            resolve(true);
        };
        const onAbort = () => {
            cleanup();
            resolve(false);
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };

        if (signal.aborted) {
            resolve(false);
            return;
        }

        res.once("drain", onDrain);
        res.once("error", onError);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

async function writeCsvChunk(res, chunk, signal) {
    if (signal.aborted) {
        return false;
    }

    if (!res.write(chunk)) {
        return waitForDrainOrClose(res, signal);
    }

    return true;
}

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
    const abortController = new AbortController();
    const onResponseClose = () => {
        if (!res.writableEnded) {
            abortController.abort();
        }
    };

    res.on("close", onResponseClose);

    try {
        const monitorId = idSchema.parse(Number(req.params.id));

        const monitor = await getMonitorById(monitorId);

if (!monitor) {
    return res.status(404).json({
        error: "Monitor not found",
    });
}

        let responseStarted = false;
        const startResponse = () => {
            res.status(200);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="monitor-${monitorId}-checks.csv"`
            );
            responseStarted = true;
        };

        const writeChunk = async (chunk) => {
            if (!responseStarted) {
                startResponse();
                if (!await writeCsvChunk(res, csvHeader, abortController.signal)) {
                    return false;
                }
            }

            return writeCsvChunk(res, chunk, abortController.signal);
        };

        for await (const check of streamChecksByMonitorId(
            monitorId,
            { signal: abortController.signal }
        )) {
            if (!await writeChunk(formatCheckAsCsv(check))) {
                return;
            }
        }

        if (!responseStarted) {
            startResponse();
            if (!await writeCsvChunk(res, csvHeader, abortController.signal)) {
                return;
            }
        }

        if (!abortController.signal.aborted) {
            res.end();
        }
    } catch (error) {
        if (abortController.signal.aborted) {
            return;
        }

        if (res.headersSent) {
            res.destroy();
        } else {
            next(error);
        }
    } finally {
        res.removeListener("close", onResponseClose);
    }
}
