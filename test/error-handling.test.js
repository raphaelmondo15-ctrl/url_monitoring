import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { z } from "zod";
import pool from "../src/db/pool.js";
import { errorHandler } from "../src/app.js";

const app = express();

app.get("/unexpected", (req, res, next) => {
    next(new Error("internal database connection details"));
});

app.get("/validation", (req, res, next) => {
    try {
        z.string().parse(42);
        res.sendStatus(204);
    } catch (error) {
        next(error);
    }
});

app.use(errorHandler);

test.after(async () => {
    await pool.end();
});

test("unexpected errors return a generic message and log the original error", async () => {
    const originalConsoleError = console.error;
    const loggedErrors = [];
    console.error = (error) => loggedErrors.push(error);

    try {
        const response = await request(app).get("/unexpected");

        assert.equal(response.status, 500);
        assert.deepEqual(response.body, {
            error: "Internal Server Error",
            message: "An unexpected error occurred",
        });
        assert.equal(JSON.stringify(response.body).includes("internal database"), false);
        assert.equal(loggedErrors.length, 1);
        assert.equal(loggedErrors[0].message, "internal database connection details");
    } finally {
        console.error = originalConsoleError;
    }
});

test("Zod validation errors retain the existing 400 response format", async () => {
    const response = await request(app).get("/validation");

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
    assert.deepEqual(response.body.details[0].path, []);
    assert.equal(response.body.details[0].code, "invalid_type");
});