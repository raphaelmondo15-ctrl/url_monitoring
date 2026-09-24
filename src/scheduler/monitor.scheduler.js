import { createCheck } from "../services/check.service.js";
import { handleIncident } from "../services/incident.service.js";
import { getActiveMonitors } from "../services/monitor.service.js";

export async function checkMonitor(monitor) {
    const startedAt = Date.now();

    let check;

    try {
        const response = await fetch(
            monitor.url,
            {
                signal: AbortSignal.timeout(10000)
            }
        );

        const latencyMs = Date.now() - startedAt;
        const ok = response.status === monitor.expected_status;

        check = await createCheck({
            monitor_id: monitor.id,
            ok,
            status_code: response.status,
            latency_ms: latencyMs,
            error: ok
                ? null
                : `Expected status ${monitor.expected_status}, received ${response.status}`
        });
    } catch (error) {
        const latencyMs = Date.now() - startedAt;

        check = await createCheck({
            monitor_id: monitor.id,
            ok: false,
            status_code: null,
            latency_ms: latencyMs,
            error: error.name === "TimeoutError"
                ? "Request timed out"
                : error.message
        });
    }

    await handleIncident(monitor.id, check);

    return check;
}

const nextCheckTimes = new Map();

export function startScheduler() {
    const timer = setInterval(async () => {
        try {
            const monitors = await getActiveMonitors();
            const now = Date.now();

            for (const monitor of monitors) {
                const nextCheck = nextCheckTimes.get(monitor.id) ?? 0;

                if (now < nextCheck) {
                    continue;
                }

                nextCheckTimes.set(
                    monitor.id,
                    now + monitor.interval_seconds * 1000
                );

                try {
                    await checkMonitor(monitor);
                } catch (error) {
                    console.error(
                        `Monitor ${monitor.id} check failed:`,
                        error.message
                    );
                }
            }
        } catch (error) {
            console.error("Scheduler tick failed:", error.message);
        }
    }, 1000);

    return timer;
}
