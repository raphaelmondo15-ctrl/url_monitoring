import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db/pool.js";
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

test("POST /monitors should create a monitor", async () => {
    const response = await request(app)
        .post("/monitors")
        .send({
            name: "Test Monitor",
            url: "https://example.com",
            interval_seconds: 60,
            expected_status: 200,
        });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.body.name, "Test Monitor");
    assert.strictEqual(response.body.url, "https://example.com");
    assert.strictEqual(response.body.interval_seconds, 60);
    assert.strictEqual(response.body.expected_status, 200);
    assert.strictEqual(response.body.is_active, true);
});

test("POST /monitors should reject an invalid URL", async () => {
    const response = await request(app)
        .post("/monitors")
        .send({
            name: "Invalid Monitor",
            url: "not-a-url",
        });

    assert.strictEqual(response.status, 400);
});

test("POST /monitors should reject interval below 10 seconds", async () => {
    const response = await request(app)
        .post("/monitors")
        .send({
            name: "Bad Interval",
            url: "https://example.com",
            interval_seconds: 5,
        });

    assert.strictEqual(response.status, 400);
});

test("POST /monitors should reject interval above 3600 seconds", async () => {
    const response = await request(app)
        .post("/monitors")
        .send({
            name: "Bad Interval",
            url: "https://example.com",
            interval_seconds: 4000,
        });

    assert.strictEqual(response.status, 400);
});

test("POST /monitors should use default values", async () => {
    const response = await request(app)
        .post("/monitors")
        .send({
            name: "Default Monitor",
            url: "https://example.com",
        });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.body.interval_seconds, 60);
    assert.strictEqual(response.body.expected_status, 200);
});

test("POST /monitors should accept expected_status boundary values", async () => {
    for (const expectedStatus of [100, 599]) {
        const response = await request(app)
            .post("/monitors")
            .send({
                name: `Boundary Monitor ${expectedStatus}`,
                url: "https://example.com",
                expected_status: expectedStatus,
            });

        assert.strictEqual(response.status, 201);
        assert.strictEqual(response.body.expected_status, expectedStatus);
    }
});

test("POST /monitors should reject out-of-range and decimal expected_status", async () => {
    for (const expectedStatus of [99, 600, 200.5]) {
        const response = await request(app)
            .post("/monitors")
            .send({
                name: `Invalid Status Monitor ${expectedStatus}`,
                url: "https://example.com",
                expected_status: expectedStatus,
            });

        assert.strictEqual(response.status, 400);
    }
});

test("GET /monitors should return a paginated list", async () => {
    await request(app)
        .post("/monitors")
        .send({
            name: "Monitor 1",
            url: "https://example.com",
        });

    await request(app)
        .post("/monitors")
        .send({
            name: "Monitor 2",
            url: "https://example.org",
        });

    const response = await request(app)
        .get("/monitors")
        .query({
            limit: 10,
        });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.items.length, 2);
    assert.strictEqual(response.body.next_cursor, null);
});

test("GET /monitors should reject an invalid limit", async () => {
    const response = await request(app)
        .get("/monitors")
        .query({
            limit: 0,
        });

    assert.strictEqual(response.status, 400);
});

test("GET /monitors/:id should return a monitor", async () => {
    const createResponse = await request(app)
        .post("/monitors")
        .send({
            name: "Monitor Details",
            url: "https://example.com",
        });

    const monitorId = createResponse.body.id;

    const response = await request(app)
        .get(`/monitors/${monitorId}`);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.id, monitorId);
    assert.strictEqual(response.body.name, "Monitor Details");
    assert.strictEqual(response.body.url, "https://example.com");
});

test("GET /monitors/:id should return 404 for a non-existent monitor", async () => {
    const response = await request(app)
        .get("/monitors/999999");

    assert.strictEqual(response.status, 404);
});

test("GET /monitors/:id should reject an invalid ID", async () => {
    const response = await request(app)
        .get("/monitors/abc");

    assert.strictEqual(response.status, 400);
});

test("PATCH /monitors/:id should update a monitor", async () => {
    const createResponse = await request(app)
        .post("/monitors")
        .send({
            name: "Original Monitor",
            url: "https://example.com",
            interval_seconds: 60,
            expected_status: 200,
        });

    const monitorId = createResponse.body.id;

    const response = await request(app)
        .patch(`/monitors/${monitorId}`)
        .send({
            name: "Updated Monitor",
            interval_seconds: 120,
        });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.id, monitorId);
    assert.strictEqual(response.body.name, "Updated Monitor");
    assert.strictEqual(response.body.interval_seconds, 120);
    assert.strictEqual(response.body.url, "https://example.com");
    assert.strictEqual(response.body.expected_status, 200);
});

test("PATCH /monitors/:id should accept expected_status boundary values", async () => {
    const createResponse = await request(app)
        .post("/monitors")
        .send({
            name: "Status Boundary Monitor",
            url: "https://example.com",
        });
    const monitorId = createResponse.body.id;

    for (const expectedStatus of [100, 599]) {
        const response = await request(app)
            .patch(`/monitors/${monitorId}`)
            .send({ expected_status: expectedStatus });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.expected_status, expectedStatus);
    }
});

test("PATCH /monitors/:id should reject out-of-range and decimal expected_status", async () => {
    const createResponse = await request(app)
        .post("/monitors")
        .send({
            name: "Invalid Status Monitor",
            url: "https://example.com",
        });
    const monitorId = createResponse.body.id;

    for (const expectedStatus of [99, 600, 200.5]) {
        const response = await request(app)
            .patch(`/monitors/${monitorId}`)
            .send({ expected_status: expectedStatus });

        assert.strictEqual(response.status, 400);
    }
});

test("PATCH /monitors/:id should reject an invalid interval", async () => {
    const createResponse = await request(app)
        .post("/monitors")
        .send({
            name: "Interval Monitor",
            url: "https://example.com",
        });

    const monitorId = createResponse.body.id;

    const response = await request(app)
        .patch(`/monitors/${monitorId}`)
        .send({
            interval_seconds: 5,
        });

    assert.strictEqual(response.status, 400);
});

test("PATCH /monitors/:id should return 404 for a non-existent monitor", async () => {
    const response = await request(app)
        .patch("/monitors/999999")
        .send({
            name: "Updated Monitor",
        });

    assert.strictEqual(response.status, 404);
});

test("PATCH /monitors/:id should reject an invalid ID", async () => {
    const response = await request(app)
        .patch("/monitors/abc")
        .send({
            name: "Updated Monitor",
        });

    assert.strictEqual(response.status, 400);
});

test("DELETE /monitors/:id should reject an invalid ID", async () => {
    const response = await request(app)
        .delete("/monitors/abc");

    assert.strictEqual(response.status, 400);
});

test("DELETE /monitors/:id should return 404 for a non-existent monitor", async () => {
    const response = await request(app)
        .delete("/monitors/999999");

    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(response.body, {
        error: "Monitor not found",
    });
});

test("DELETE /monitors/:id should return 204 and remove the monitor", async () => {
    const createResponse = await request(app)
        .post("/monitors")
        .send({
            name: "Delete Test Monitor",
            url: "https://example.com",
        });
    const monitorId = createResponse.body.id;

    const response = await request(app)
        .delete(`/monitors/${monitorId}`);

    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.text, "");

    const result = await pool.query(
        "SELECT id FROM monitors WHERE id = $1",
        [monitorId]
    );
    assert.strictEqual(result.rows.length, 0);
});

test("GET /monitors should reject an invalid after cursor", async () => {
    const response = await request(app)
        .get("/monitors?after=abc");

    assert.equal(response.status, 400);
});
