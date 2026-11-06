import test from "node:test";
import assert from "node:assert";
import http from "node:http";

process.env.CHECK_TIMEOUT_MS = "500";

const { default: pool } = await import("../src/db/pool.js");
const {
    setupTestDatabase,
    cleanTestDatabase,
    closeTestDatabase,
} = await import("../test-support/database.js");
const {
    runDueChecks,
    startScheduler,
    stopScheduler,
} = await import("../src/scheduler/monitor.scheduler.js");
const { SafeRequestError } = await import("../src/security/safe-http.js");

async function localTestHttpRequest(url, { timeoutMs }) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual",
    });
    return { statusCode: response.status };
}

function runLocalDueChecks(now) {
    return runDueChecks(now, { httpRequest: localTestHttpRequest });
}

const servers = new Set();

async function startServer(handler) {
    const server = http.createServer(handler);

    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    servers.add(server);
    return `http://127.0.0.1:${server.address().port}`;
}

async function closeServers() {
    await Promise.all([...servers].map((server) => new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections?.();
    })));
    servers.clear();
}

async function createMonitor(url, {
    name = "Scheduler Test",
    intervalSeconds = 10,
    expectedStatus = 200,
    isActive = true,
    lastCheckedAt,
} = {}) {
    const result = await pool.query(
        `INSERT INTO monitors (
            name,
            url,
            interval_seconds,
            expected_status,
            is_active
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [name, url, intervalSeconds, expectedStatus, isActive]
    );
    const monitor = result.rows[0];

    if (lastCheckedAt !== undefined) {
        await pool.query(
            `INSERT INTO checks (monitor_id, ok, status_code, latency_ms)
             VALUES ($1, true, $2, 1)
             RETURNING checked_at`,
            [monitor.id, expectedStatus]
        );

        if (lastCheckedAt !== null) {
            await pool.query(
                `UPDATE checks
                 SET checked_at = $1
                 WHERE monitor_id = $2`,
                [lastCheckedAt, monitor.id]
            );
        }
    }

    return monitor;
}

async function getChecks(monitorId) {
    const result = await pool.query(
        `SELECT * FROM checks WHERE monitor_id = $1 ORDER BY id ASC`,
        [monitorId]
    );
    return result.rows;
}

test.before(async () => {
    await setupTestDatabase();
});

test.beforeEach(async () => {
    await cleanTestDatabase();
});

test.afterEach(async () => {
    stopScheduler();
    await closeServers();
});

test.after(async () => {
    await closeTestDatabase();
});

test("startScheduler creates one active timer, runs checks, and stops cleanly", async () => {
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const timers = [];

    globalThis.setInterval = (callback, delay) => {
        const timer = {
            callback,
            delay,
            active: true,
            fire() {
                return this.active ? this.callback() : undefined;
            },
        };
        timers.push(timer);
        return timer;
    };
    globalThis.clearInterval = (timer) => {
        timer.active = false;
    };

    try {
        const monitor = await createMonitor("http://127.0.0.1:9/scheduler-test");
        const firstTimer = startScheduler(25);

        assert.equal(firstTimer.active, true);
        assert.equal(firstTimer.delay, 25);
        assert.equal(timers.length, 1);
        assert.strictEqual(startScheduler(50), firstTimer);
        assert.equal(timers.length, 1);

        await firstTimer.fire();
        assert.equal((await getChecks(monitor.id)).length, 1);

        stopScheduler();
        assert.equal(firstTimer.active, false);

        await firstTimer.fire();
        assert.equal((await getChecks(monitor.id)).length, 1);
    } finally {
        stopScheduler();
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
    }
});

test("runDueChecks checks a new monitor and skips it until due", async () => {
    let requestCount = 0;
    const url = await startServer((req, res) => {
        requestCount += 1;
        res.writeHead(200);
        res.end("OK");
    });

    const monitor = await createMonitor(url);
    const now = Date.now();

    await runLocalDueChecks(now);

    let checks = await getChecks(monitor.id);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].ok, true);
    assert.equal(requestCount, 1);

    await runLocalDueChecks(checks[0].checked_at.getTime() + 9999);
    checks = await getChecks(monitor.id);
    assert.equal(checks.length, 1);
    assert.equal(requestCount, 1);

    await runLocalDueChecks(checks[0].checked_at.getTime() + 10000);
    checks = await getChecks(monitor.id);
    assert.equal(checks.length, 2);
    assert.equal(requestCount, 2);
});

test("runDueChecks uses persisted check time after scheduler state is empty", async () => {
    let requestCount = 0;
    const url = await startServer((req, res) => {
        requestCount += 1;
        res.writeHead(200);
        res.end("OK");
    });

    const lastCheckedAt = new Date(Date.now() - 15000);
    const monitor = await createMonitor(url, { lastCheckedAt });

    await runLocalDueChecks(Date.now());

    const checks = await getChecks(monitor.id);
    assert.equal(checks.length, 2);
    assert.equal(requestCount, 1);
});

test("runDueChecks recalculates due time when a monitor interval changes", async () => {
    let requestCount = 0;
    const url = await startServer((req, res) => {
        requestCount += 1;
        res.writeHead(200);
        res.end("OK");
    });
    const monitor = await createMonitor(url);

    await runLocalDueChecks(Date.now());
    let checks = await getChecks(monitor.id);
    const lastCheckedAt = checks[0].checked_at.getTime();

    await pool.query(
        `UPDATE monitors SET interval_seconds = 20 WHERE id = $1`,
        [monitor.id]
    );

    await runLocalDueChecks(lastCheckedAt + 10000);
    checks = await getChecks(monitor.id);
    assert.equal(checks.length, 1);
    assert.equal(requestCount, 1);

    await runLocalDueChecks(lastCheckedAt + 20000);
    checks = await getChecks(monitor.id);
    assert.equal(checks.length, 2);
    assert.equal(requestCount, 2);
});

test("runDueChecks avoids overlapping checks for the same monitor", async () => {
    let requestCount = 0;
    let signalRequestStarted;
    let releaseResponse;
    const requestStarted = new Promise((resolve) => {
        signalRequestStarted = resolve;
    });
    const responseGate = new Promise((resolve) => {
        releaseResponse = resolve;
    });
    const url = await startServer(async (req, res) => {
        requestCount += 1;
        signalRequestStarted();
        await responseGate;
        res.writeHead(200);
        res.end("OK");
    });
    const monitor = await createMonitor(url);
    const firstTick = runLocalDueChecks(Date.now());

    await requestStarted;
    try {
        await runLocalDueChecks(Date.now() + 10000);
    } finally {
        releaseResponse();
        await firstTick;
    }

    assert.equal((await getChecks(monitor.id)).length, 1);
    assert.equal(requestCount, 1);
});

test("runDueChecks does not check monitors that are not due or inactive", async () => {
    let requestCount = 0;
    const url = await startServer((req, res) => {
        requestCount += 1;
        res.writeHead(200);
        res.end("OK");
    });

    const recentCheck = await createMonitor(url, {
        name: "Not Due",
        lastCheckedAt: new Date(),
    });
    const inactive = await createMonitor(url, {
        name: "Inactive",
        isActive: false,
    });

    await runLocalDueChecks(Date.now());

    assert.equal((await getChecks(recentCheck.id)).length, 1);
    assert.equal((await getChecks(inactive.id)).length, 0);
    assert.equal(requestCount, 0);
});

test("runDueChecks opens and resolves incidents through the scheduler", async () => {
    let statusCode = 500;
    const url = await startServer((req, res) => {
        res.writeHead(statusCode);
        res.end(statusCode === 200 ? "OK" : "Failure");
    });
    const monitor = await createMonitor(url);

    await runLocalDueChecks(Date.now());

    const failedChecks = await getChecks(monitor.id);
    assert.equal(failedChecks.length, 1);
    assert.equal(failedChecks[0].ok, false);
    assert.equal(failedChecks[0].status_code, 500);

    const openIncident = await pool.query(
        `SELECT * FROM incidents
         WHERE monitor_id = $1 AND resolved_at IS NULL`,
        [monitor.id]
    );
    assert.equal(openIncident.rows.length, 1);

    statusCode = 200;
    await runLocalDueChecks(failedChecks[0].checked_at.getTime() + 10000);

    const recoveredChecks = await getChecks(monitor.id);
    assert.equal(recoveredChecks.length, 2);
    assert.equal(recoveredChecks[1].ok, true);

    const resolvedIncident = await pool.query(
        `SELECT * FROM incidents WHERE id = $1`,
        [openIncident.rows[0].id]
    );
    assert.ok(resolvedIncident.rows[0].resolved_at);
});

test("runDueChecks stores timeout failures and opens an incident", async () => {
    const url = await startServer(() => {});
    const monitor = await createMonitor(url);

    await runLocalDueChecks(Date.now());

    const checks = await getChecks(monitor.id);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].ok, false);
    assert.equal(checks[0].status_code, null);
    assert.equal(checks[0].error, "Request timed out");

    const incidents = await pool.query(
        `SELECT * FROM incidents
         WHERE monitor_id = $1 AND resolved_at IS NULL`,
        [monitor.id]
    );
    assert.equal(incidents.rows.length, 1);
});

test("runDueChecks rejects stored loopback URLs and records a generic failure", async () => {
    const monitor = await createMonitor("http://127.0.0.1:9/private-service");

    await runDueChecks(Date.now());

    const checks = await getChecks(monitor.id);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].ok, false);
    assert.equal(checks[0].status_code, null);
    assert.equal(checks[0].error, "Monitor destination rejected");
    assert.equal(checks[0].error.includes("127.0.0.1"), false);
});

test("runDueChecks records DNS validation failures without exposing resolver details", async () => {
    const monitor = await createMonitor("https://dns-failure.example");
    const httpRequest = async () => {
        throw new SafeRequestError("private DNS answer: 10.1.2.3");
    };

    await runDueChecks(Date.now(), { httpRequest });

    const checks = await getChecks(monitor.id);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].ok, false);
    assert.equal(checks[0].error, "Monitor destination rejected");
    assert.equal(checks[0].error.includes("10.1.2.3"), false);
});
