import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db/pool.js";

test("GET /monitors/:id/checks should return check history", async () => {
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
            "Check History Test",
            "https://example.com",
            60,
            200
        ]
    );

    const monitor = monitorResult.rows[0];

    await pool.query(
        `INSERT INTO checks (
            monitor_id,
            ok,
            status_code,
            latency_ms,
            error
        )
        VALUES
            ($1, true, 200, 120, NULL),
            ($1, true, 200, 150, NULL),
            ($1, false, 500, 300, 'Server error')`,
        [monitor.id]
    );

    const response = await request(app)
        .get(`/monitors/${monitor.id}/checks?limit=2`);

    assert.equal(response.status, 200);
    assert.equal(response.body.items.length, 2);
    assert.equal(response.body.next_cursor, response.body.items[1].id);

    assert.equal(response.body.items[0].monitor_id, monitor.id);

    const nextResponse = await request(app)
        .get(`/monitors/${monitor.id}/checks?after=${response.body.next_cursor}&limit=2`);

    assert.equal(nextResponse.status, 200);
    assert.equal(nextResponse.body.items.length, 1);
    assert.equal(nextResponse.body.next_cursor, null);
});

