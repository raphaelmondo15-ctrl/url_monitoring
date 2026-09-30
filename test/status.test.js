import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db/pool.js";
import { setupTestDatabase, cleanTestDatabase, closeTestDatabase } from "./setup.js";

test.before(async () => {
    await setupTestDatabase();
});

test.beforeEach(async () => {
    await cleanTestDatabase();
});

test.after(async () => {
    await closeTestDatabase();
});

test("GET /status should return active monitors", async () => {
    const monitorResult = await pool.query(
        `INSERT INTO monitors (
            name,
            url,
            interval_seconds,
            expected_status,
            is_active
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
            "Status Test Monitor",
            "https://example.com",
            60,
            200,
            true
        ]
    );

    const monitor = monitorResult.rows[0];

    const response = await request(app)
        .get("/status");

    assert.equal(response.status, 200);
    assert.equal(response.body.monitors.length, 1);
    assert.equal(response.body.monitors[0].id, monitor.id);
    assert.equal(response.body.monitors[0].name, "Status Test Monitor");
    assert.equal(response.body.monitors[0].ok, null);
});
