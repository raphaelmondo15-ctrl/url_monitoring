import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import pool from "../src/db/pool.js";
import app from "../src/app.js";

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
