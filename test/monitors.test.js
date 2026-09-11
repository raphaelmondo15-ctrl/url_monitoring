import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app.js";
import {
    setupTestDatabase,
    cleanTestDatabase,
    closeTestDatabase,
} from "./setup.js";

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