import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import pool from "../src/db/pool.js";
import app from "../src/app.js";
import { handleIncident } from "../src/services/incident.service.js";
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
    assert.deepEqual(response.body.next_cursor, null);

    const incident = response.body.items.find(
        (item) => item.monitor_id === monitor.id
    );

    assert.ok(incident);
    assert.equal(incident.cause, "Server error");
});

test("GET /incidents should return an empty page when there are no incidents", async () => {
    const response = await request(app).get("/incidents");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
        items: [],
        next_cursor: null,
    });
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
            cause,
            resolved_at
        )
        VALUES ($1, $2, now()), ($1, $3, NULL)`,
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
    assert.equal(response.body.next_cursor, null);
    assert.equal(response.body.items[0].monitor_id, monitor.id);
    assert.equal(response.body.items[1].monitor_id, monitor.id);
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

async function createIncident(monitorId, startedAt, cause = "Test incident") {
    const result = await pool.query(
        `INSERT INTO incidents (monitor_id, started_at, resolved_at, cause)
         VALUES ($1, $2, $2, $3)
         RETURNING id`,
        [monitorId, startedAt, cause]
    );
    return result.rows[0].id;
}

test("GET /incidents paginates equal timestamps without gaps or duplicates", async () => {
    const monitorIds = await Promise.all(
        Array.from({ length: 5 }, (_, index) => createMonitor(`Page ${index}`))
    );
    const timestamp = "2026-10-12T10:20:30.123456Z";
    const insertedIds = [];

    for (const monitorId of monitorIds) {
        insertedIds.push(await createIncident(monitorId, timestamp));
    }

    const firstPage = await request(app).get("/incidents?limit=2");
    assert.equal(firstPage.status, 200);
    assert.deepEqual(firstPage.body.items.map((item) => item.id), insertedIds.slice(-2).reverse());
    assert.equal(typeof firstPage.body.next_cursor, "string");

    const secondPage = await request(app)
        .get(`/incidents?limit=2&after=${encodeURIComponent(firstPage.body.next_cursor)}`);
    assert.equal(secondPage.status, 200);
    assert.deepEqual(secondPage.body.items.map((item) => item.id), insertedIds.slice(1, 3).reverse());
    assert.equal(typeof secondPage.body.next_cursor, "string");

    const thirdPage = await request(app)
        .get(`/incidents?limit=2&after=${encodeURIComponent(secondPage.body.next_cursor)}`);
    assert.equal(thirdPage.status, 200);
    assert.deepEqual(thirdPage.body.items.map((item) => item.id), [insertedIds[0]]);
    assert.equal(thirdPage.body.next_cursor, null);

    const pageIds = [
        ...firstPage.body.items,
        ...secondPage.body.items,
        ...thirdPage.body.items,
    ].map((item) => item.id);
    assert.deepEqual(pageIds, insertedIds.slice().reverse());
    assert.equal(new Set(pageIds).size, insertedIds.length);
});

test("incident cursor preserves PostgreSQL microsecond timestamp precision", async () => {
    const earlierMonitorId = await createMonitor("Earlier timestamp");
    const laterMonitorId = await createMonitor("Later timestamp");
    const earlierId = await createIncident(
        earlierMonitorId,
        "2026-10-12T10:20:30.123456Z"
    );
    const laterId = await createIncident(
        laterMonitorId,
        "2026-10-12T10:20:30.123457Z"
    );

    const firstPage = await request(app).get("/incidents?limit=1");
    assert.deepEqual(firstPage.body.items.map((item) => item.id), [laterId]);

    const secondPage = await request(app)
        .get(`/incidents?limit=1&after=${encodeURIComponent(firstPage.body.next_cursor)}`);
    assert.deepEqual(secondPage.body.items.map((item) => item.id), [earlierId]);
    assert.equal(secondPage.body.next_cursor, null);
});

test("incident cursor accepts the PostgreSQL INTEGER maximum ID", async () => {
    const cursor = Buffer.from(JSON.stringify({
        started_at: "2026-02-28T10:20:30.123456Z",
        id: 2147483647,
    })).toString("base64url");

    const response = await request(app)
        .get(`/incidents?after=${encodeURIComponent(cursor)}`);

    assert.equal(response.status, 200);
});

test("incident endpoints reject malformed cursors and invalid limits", async () => {
    const oversizedIncidentCursor = Buffer.from(JSON.stringify({
        started_at: "2026-02-28T10:20:30.123456Z",
        id: 2147483648,
    })).toString("base64url");
    const malformedCursors = [
        "not-a-cursor",
        "a".repeat(257),
        Buffer.from("{}").toString("base64url"),
        Buffer.from(JSON.stringify({
            started_at: "2026-02-30T10:20:30.123456Z",
            id: 1,
        })).toString("base64url"),
        Buffer.from(JSON.stringify({
            started_at: "2026-02-28T10:20:30.123456Z",
            id: 0,
        })).toString("base64url"),
        oversizedIncidentCursor,
    ];
    const invalidLimits = ["0", "101", "abc"];

    for (const cursor of malformedCursors) {
        const response = await request(app)
            .get(`/incidents?after=${encodeURIComponent(cursor)}`);
        assert.equal(response.status, 400);
        assert.equal(response.body.error, "Validation failed");
    }

    for (const limit of invalidLimits) {
        const response = await request(app).get(`/incidents?limit=${limit}`);
        assert.equal(response.status, 400);
        assert.equal(response.body.error, "Validation failed");
    }
});

test("monitor incident pagination preserves filtering and empty results", async () => {
    const targetMonitorId = await createMonitor("Filtered monitor");
    const otherMonitorId = await createMonitor("Other monitor");
    const targetIds = [];

    targetIds.push(await createIncident(
        targetMonitorId,
        "2026-10-12T10:20:30.123456Z",
        "target older"
    ));
    targetIds.push(await createIncident(
        targetMonitorId,
        "2026-10-12T10:20:31.123456Z",
        "target newer"
    ));
    await createIncident(otherMonitorId, "2026-10-12T10:20:32.123456Z");

    const firstPage = await request(app)
        .get(`/monitors/${targetMonitorId}/incidents?limit=1`);
    assert.equal(firstPage.status, 200);
    assert.deepEqual(firstPage.body.items.map((item) => item.id), [targetIds[1]]);
    assert.equal(firstPage.body.items[0].monitor_id, targetMonitorId);

    const secondPage = await request(app)
        .get(`/monitors/${targetMonitorId}/incidents?limit=1&after=${encodeURIComponent(firstPage.body.next_cursor)}`);
    assert.equal(secondPage.status, 200);
    assert.deepEqual(secondPage.body.items.map((item) => item.id), [targetIds[0]]);
    assert.equal(secondPage.body.next_cursor, null);

    const emptyMonitorId = await createMonitor("No incidents");
    const emptyPage = await request(app)
        .get(`/monitors/${emptyMonitorId}/incidents`);
    assert.deepEqual(emptyPage.body, { items: [], next_cursor: null });
});

test("monitor incident endpoint rejects invalid cursors and limits", async () => {
    const monitorId = await createMonitor("Invalid pagination");

    const invalidCursor = await request(app)
        .get(`/monitors/${monitorId}/incidents?after=%%%`);
    assert.equal(invalidCursor.status, 400);
    assert.equal(invalidCursor.body.error, "Validation failed");

    const invalidLimit = await request(app)
        .get(`/monitors/${monitorId}/incidents?limit=101`);
    assert.equal(invalidLimit.status, 400);
    assert.equal(invalidLimit.body.error, "Validation failed");

    const nonNumericLimit = await request(app)
        .get(`/monitors/${monitorId}/incidents?limit=abc`);
    assert.equal(nonNumericLimit.status, 400);
    assert.equal(nonNumericLimit.body.error, "Validation failed");
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

   await Promise.all([
    handleIncident(monitor.id, failedCheck),
    handleIncident(monitor.id, failedCheck),
]);

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
