import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import pool from "../src/db/pool.js";
import app from "../src/app.js";
import {
    setupTestDatabase,
    cleanTestDatabase,
    closeTestDatabase,
} from "../test-support/database.js";

test.before(async () => {
    await setupTestDatabase();
});

test.beforeEach(async () => {
    await cleanTestDatabase();
});

test.after(async () => {
    await closeTestDatabase();
});

async function createMonitor(name) {
    const result = await pool.query(
        `INSERT INTO monitors (name, url)
         VALUES ($1, $2)
         RETURNING id`,
        [name, "https://example.com"]
    );

    return result.rows[0].id;
}

async function addChecks(monitorId, outcomes, checkedAt = new Date()) {
    for (const ok of outcomes) {
        await pool.query(
            `INSERT INTO checks (
                monitor_id,
                checked_at,
                ok,
                status_code,
                latency_ms
            )
            VALUES ($1, $2, $3, $4, 100)`,
            [monitorId, checkedAt, ok, ok ? 200 : 500]
        );
    }
}

async function getUptime(monitorId, window = "24h") {
    return request(app)
        .get(`/monitors/${monitorId}/uptime`)
        .query({ window });
}

test("GET /monitors/:id/uptime should return uptime and latency metrics", async () => {
    const monitorResult = await pool.query(
        `INSERT INTO monitors (
            name,
            url,
            interval_seconds,
            expected_status
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [
            "Uptime Test",
            "https://example.com",
            60,
            200
        ]
    );

    const monitor = monitorResult.rows[0];

    await pool.query(
        `INSERT INTO checks (
            monitor_id,
            checked_at,
            ok,
            status_code,
            latency_ms,
            error
        )
        VALUES
            ($1, now() - interval '1 hour', true, 200, 100, NULL),
            ($1, now() - interval '30 minutes', true, 200, 200, NULL),
            ($1, now() - interval '10 minutes', false, 500, 300, 'Server error')`,
        [monitor.id]
    );

    const response = await request(app)
        .get(`/monitors/${monitor.id}/uptime?window=24h`);

    assert.equal(response.status, 200);

    assert.equal(response.body.uptime_percentage, 66.66666666666667);
    assert.equal(response.body.average_latency_ms, 200);
    assert.equal(response.body.p95_latency_ms, 290);
});

test("GET /monitors/:id/uptime should return null when the window has no checks", async () => {
    const emptyMonitorId = await createMonitor("No uptime checks");
    const oldChecksMonitorId = await createMonitor("Checks outside uptime window");
    await addChecks(oldChecksMonitorId, [true, false], new Date(Date.now() - 48 * 60 * 60 * 1000));

    for (const monitorId of [emptyMonitorId, oldChecksMonitorId]) {
        const response = await getUptime(monitorId, "24h");

        assert.equal(response.status, 200);
        assert.equal(response.body.uptime_percentage, null);
        assert.equal(response.body.average_latency_ms, null);
        assert.equal(response.body.p95_latency_ms, null);
    }
});

test("GET /monitors/:id/uptime returns null latencies when checks lack measurements", async () => {
    const monitorId = await createMonitor("Checks without latency");
    await pool.query(
        `INSERT INTO checks (monitor_id, ok, status_code, latency_ms)
         VALUES ($1, true, 200, NULL), ($1, false, 500, NULL)`,
        [monitorId]
    );

    const response = await getUptime(monitorId);

    assert.equal(response.status, 200);
    assert.equal(response.body.uptime_percentage, 50);
    assert.equal(response.body.average_latency_ms, null);
    assert.equal(response.body.p95_latency_ms, null);
});

test("GET /monitors/:id/uptime preserves actual zero latency measurements", async () => {
    const monitorId = await createMonitor("Zero latency measurements");
    await pool.query(
        `INSERT INTO checks (monitor_id, ok, status_code, latency_ms)
         VALUES ($1, true, 200, 0), ($1, false, 500, 0)`,
        [monitorId]
    );

    const response = await getUptime(monitorId);

    assert.equal(response.status, 200);
    assert.equal(response.body.uptime_percentage, 50);
    assert.equal(response.body.average_latency_ms, 0);
    assert.equal(response.body.p95_latency_ms, 0);
});

test("GET /monitors/:id/uptime should calculate uptime for available checks", async () => {
    const cases = [
        { name: "All successful", outcomes: [true, true], percentage: 100 },
        { name: "All failed", outcomes: [false, false], percentage: 0 },
        { name: "Half successful", outcomes: [true, false], percentage: 50 },
        { name: "Three of four successful", outcomes: [true, true, true, false], percentage: 75 },
    ];

    for (const { name, outcomes, percentage } of cases) {
        const monitorId = await createMonitor(name);
        await addChecks(monitorId, outcomes);

        const response = await getUptime(monitorId);

        assert.equal(response.status, 200);
        assert.equal(response.body.uptime_percentage, percentage);
        assert.equal(typeof response.body.average_latency_ms, "number");
        assert.equal(typeof response.body.p95_latency_ms, "number");
    }
});

test("GET /monitors/:id/uptime should return 404 for a non-existent monitor", async () => {
    const response = await request(app)
        .get("/monitors/999999/uptime");

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Monitor not found");
});

test("GET /monitors/:id/uptime should reject an invalid ID", async () => {
    const response = await request(app)
        .get("/monitors/abc/uptime");

    assert.equal(response.status, 400);
});
