import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import pool from "../src/db/pool.js";
import app from "../src/app.js";
import { handleIncident } from "../src/services/incident.service.js";

test("GET /incidents should return incident history", async () => {
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
            "Incident History Test",
            "https://example.com",
            60,
            200
        ]
    );

    const monitor = monitorResult.rows[0];

    await pool.query(
        `INSERT INTO incidents (
            monitor_id,
            cause
        )
        VALUES ($1, $2)`,
        [
            monitor.id,
            "Server error"
        ]
    );

    const response = await request(app)
        .get("/incidents");

           assert.equal(response.status, 200);

    const incident = response.body.items.find(
        (item) => item.monitor_id === monitor.id
    );

    assert.ok(incident);
    assert.equal(incident.cause, "Server error");
});

test("GET /monitors/:id/incidents should return incidents for a monitor", async () => {
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
            "Monitor Incident History Test",
            "https://example.com",
            60,
            200
        ]
    );

    const monitor = monitorResult.rows[0];

    await pool.query(
        `INSERT INTO incidents (
            monitor_id,
            cause
        )
        VALUES ($1, $2), ($1, $3)`,
        [
            monitor.id,
            "Server error",
            "Timeout"
        ]
    );

    const response = await request(app)
        .get(`/monitors/${monitor.id}/incidents`);

    assert.equal(response.status, 200);
    assert.equal(response.body.items.length, 2);
    assert.equal(response.body.items[0].monitor_id, monitor.id);
    assert.equal(response.body.items[1].monitor_id, monitor.id);
});

test("GET /monitors/:id/incidents should return 404 for a non-existent monitor", async () => {
    const response = await request(app)
        .get("/monitors/999999/incidents");

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Monitor not found");
});

test("GET /monitors/:id/incidents should reject an invalid ID", async () => {
    const response = await request(app)
        .get("/monitors/abc/incidents");

    assert.equal(response.status, 400);
});

test("handleIncident should not create a duplicate open incident", async () => {
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
            "Duplicate Incident Test",
            "https://example.com",
            60,
            200
        ]
    );

    const monitor = monitorResult.rows[0];

    const failedCheck = {
        ok: false,
        status_code: 500,
        error: "Server error"
    };

    await handleIncident(monitor.id, failedCheck);
    await handleIncident(monitor.id, failedCheck);

    const result = await pool.query(
        `
        SELECT *
        FROM incidents
        WHERE monitor_id = $1
          AND resolved_at IS NULL
        `,
        [monitor.id]
    );

    assert.equal(result.rows.length, 1);
});
