import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { assertSafeTestDatabaseUrl } from "../src/db/pool.js";
import {
    cleanTestDatabase,
    closeTestDatabase,
    setupTestDatabase,
    testPool,
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

test("test database guard accepts the dedicated local database", () => {
    const connectionString =
        "postgresql://test:test@localhost:5432/url_monitoring_test";

    assert.equal(
        assertSafeTestDatabaseUrl(connectionString),
        connectionString
    );
});

test("test database guard rejects a non-test database name", () => {
    assert.throws(
        () => assertSafeTestDatabaseUrl(
            "postgresql://test:test@localhost:5432/url_monitoring"
        ),
        /dedicated local url_monitoring_test database/
    );
});

test("test database guard rejects a remote host", () => {
    assert.throws(
        () => assertSafeTestDatabaseUrl(
            "postgresql://test:test@db.example.invalid:5432/url_monitoring_test"
        ),
        /dedicated local url_monitoring_test database/
    );
});

test("test mode overrides an inherited DATABASE_URL with .env.test", () => {
    const result = spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "-e",
            "import pool from './src/db/pool.js'; await pool.end();",
        ],
        {
            cwd: process.cwd(),
            env: {
                ...process.env,
                NODE_ENV: "test",
                DATABASE_URL:
                    "postgresql://test:test@remote.invalid:5432/production",
            },
            encoding: "utf8",
        }
    );

    assert.equal(result.status, 0, result.stderr);
});

test("test setup creates the partial unique open-incident index", async () => {
    const result = await testPool.query(
        `SELECT indexdef
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'incidents'
           AND indexname = 'idx_one_open_incident_per_monitor'`
    );

    assert.equal(result.rows.length, 1);
    assert.match(result.rows[0].indexdef, /WHERE \(resolved_at IS NULL\)/);
});