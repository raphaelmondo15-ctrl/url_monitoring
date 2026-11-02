import { createCheck } from "../services/check.service.js";
import { handleIncident } from "../services/incident.service.js";
import { getActiveMonitors } from "../services/monitor.service.js";
import { CHECK_TIMEOUT_MS } from "../config/env.js";

const nextCheckTimes = new Map();
const checksInProgress = new Set();
const SCHEDULER_TICK_MS = 1000;

function timestampMilliseconds(value) {
    if (value == null) {
        return null;
    }

    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

function scheduleFromLastCheck(monitor) {
    const lastCheckedAt = timestampMilliseconds(monitor.last_checked_at);

    return {
        intervalSeconds: monitor.interval_seconds,
        lastCheckedAt,
        nextDueAt: lastCheckedAt === null
            ? Number.NEGATIVE_INFINITY
            : lastCheckedAt + monitor.interval_seconds * 1000,
    };
}

export async function checkMonitor(monitor) {
    const startedAt = Date.now();

    let response;

    try {
        response = await fetch(
            monitor.url,
            {
                signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            }
        );
    } catch (error) {
        const latencyMs = Date.now() - startedAt;

        const check = await createCheck({
            monitor_id: monitor.id,
            ok: false,
            status_code: null,
            latency_ms: latencyMs,
            error: error.name === "TimeoutError"
                ? "Request timed out"
                : error.message
        });

        await handleIncident(monitor.id, check);

        return check;
    }

    const latencyMs = Date.now() - startedAt;
    const ok = response.status === monitor.expected_status;

    const check = await createCheck({
        monitor_id: monitor.id,
        ok,
        status_code: response.status,
        latency_ms: latencyMs,
        error: ok
            ? null
            : `Expected status ${monitor.expected_status}, received ${response.status}`
    });

    await handleIncident(monitor.id, check);

    return check;
}

export async function runDueChecks(now = Date.now()) {
    const monitors = await getActiveMonitors();
    const activeMonitorIds = new Set(monitors.map((monitor) => monitor.id));

    for (const monitorId of nextCheckTimes.keys()) {
        if (!activeMonitorIds.has(monitorId)) {
            nextCheckTimes.delete(monitorId);
        }
    }

    for (const monitor of monitors) {
        const monitorId = monitor.id;
        let schedule = nextCheckTimes.get(monitorId);
        const lastCheckedAt = timestampMilliseconds(monitor.last_checked_at);

        if (
            !schedule
            || schedule.intervalSeconds !== monitor.interval_seconds
            || schedule.lastCheckedAt !== lastCheckedAt
        ) {
            schedule = scheduleFromLastCheck(monitor);
            nextCheckTimes.set(monitorId, schedule);
        }

        if (now < schedule.nextDueAt || checksInProgress.has(monitorId)) {
            continue;
        }

        schedule.nextDueAt = now + monitor.interval_seconds * 1000;
        checksInProgress.add(monitorId);

        try {
            const check = await checkMonitor(monitor);
            const checkedAt = timestampMilliseconds(check.checked_at);
            const currentSchedule = nextCheckTimes.get(monitorId);

            if (checkedAt !== null && currentSchedule) {
                currentSchedule.lastCheckedAt = checkedAt;
                currentSchedule.nextDueAt = checkedAt
                    + currentSchedule.intervalSeconds * 1000;
            }
        } catch (error) {
            console.error(`Monitor ${monitorId} check failed:`, error.message);
        } finally {
            checksInProgress.delete(monitorId);
        }
    }
}

export function startScheduler(tickIntervalMs = SCHEDULER_TICK_MS) {
    const timer = setInterval(() => {
        runDueChecks().catch((error) => {
            console.error("Scheduler tick failed:", error.message);
        });
    }, tickIntervalMs);

    return timer;
}
