import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import request from "supertest";
import QueryStream from "pg-query-stream";
import app from "../src/app.js";
import pool from "../src/db/pool.js";
import {
    setupTestDatabase,
    cleanTestDatabase,
    closeTestDatabase,
} from "../test-support/database.js";

const observedClients = new Map();
const streamedClients = new Set();
let streamReleaseCount = 0;
let resolveStreamRelease;
let streamReleasePromise = new Promise((resolve) => {
    resolveStreamRelease = resolve;
});

function observeCsvStreams(onStream = () => {}) {
    const onAcquire = (client) => {
        const originalQuery = client.query;
        client.query = function (query, ...args) {
            if (query instanceof QueryStream) {
                streamedClients.add(client);
                onStream(query);
                const result = originalQuery.call(this, query, ...args);
                client.query = originalQuery;
                return result;
            }

            return originalQuery.call(this, query, ...args);
        };
        observedClients.set(client, originalQuery);
    };
    const onRelease = (_error, client) => {
        if (streamedClients.has(client)) {
            streamReleaseCount += 1;
            resolveStreamRelease();
        }
    };

    streamReleaseCount = 0;
    streamReleasePromise = new Promise((resolve) => {
        resolveStreamRelease = resolve;
    });
    pool.on("acquire", onAcquire);
    pool.on("release", onRelease);

    return {
        get releaseCount() {
            return streamReleaseCount;
        },
        released: streamReleasePromise,
        stop() {
            pool.removeListener("acquire", onAcquire);
            pool.removeListener("release", onRelease);
            for (const [client, originalQuery] of observedClients) {
                client.query = originalQuery;
            }
            observedClients.clear();
            streamedClients.clear();
        },
    };
}

async function createMonitorForCsv(name = "CSV Export Test") {
    const result = await pool.query(
        `INSERT INTO monitors (name, url)
         VALUES ($1, $2)
         RETURNING id`,
        [name, "https://example.com"]
    );

    return result.rows[0].id;
}

test.before(async () => {
    await setupTestDatabase();
});

test.beforeEach(async () => {
    await cleanTestDatabase();
    await pool.query(
        `INSERT INTO monitors (name, url)
        VALUES ($1, $2)`,
        ["Pagination Test Monitor", "https://example.com"]
    );
});

test.after(async () => {
    await closeTestDatabase();
});

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

test("GET /monitors/:id/checks should reject an invalid ID", async () => {
    const response = await request(app)
        .get("/monitors/abc/checks");

    assert.equal(response.status, 400);
});

test("GET /monitors/:id/checks should return 404 for a non-existent monitor", async () => {
    const response = await request(app)
        .get("/monitors/999999/checks");

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Monitor not found");
});

test("GET /monitors/:id/checks.csv should export check history as CSV", async () => {
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
            "CSV Export Test",
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
            ($1, false, 500, 300, 'Server error, "quoted"\nsecond line'),
            ($1, false, NULL, NULL, NULL)`,
        [monitor.id]
    );

    const response = await request(app)
        .get(`/monitors/${monitor.id}/checks.csv`);

    assert.equal(response.status, 200);
    assert.match(
        response.headers["content-type"],
        /text\/csv/
    );

    assert.match(
        response.headers["content-disposition"],
        /monitor-\d+-checks\.csv/
    );

    assert.equal(
        response.text.split("\n")[0],
        "id,monitor_id,checked_at,ok,status_code,latency_ms,error"
    );

    assert.match(response.text, /true,200,120/);
    assert.ok(response.text.includes('"Server error, ""quoted""\nsecond line"'));
    assert.match(response.text, /false,,,""/);
});

test("CSV export streams incrementally and stops at 10,000 rows", async () => {
    const monitorId = await createMonitorForCsv("Large CSV Export");
    await pool.query(
        `INSERT INTO checks (monitor_id, ok, status_code, latency_ms, error)
         SELECT $1, true, 200, 1, NULL
         FROM generate_series(1, 10005)`,
        [monitorId]
    );

    let observedStream;
    let cursorReadCount = 0;
    const observer = observeCsvStreams((stream) => {
        observedStream = stream;
        const cursorRead = stream.cursor.read;
        stream.cursor.read = function (...args) {
            cursorReadCount += 1;
            return cursorRead.apply(this, args);
        };
    });

    try {
        const response = await request(app)
            .get(`/monitors/${monitorId}/checks.csv`);

        assert.equal(response.status, 200);
        assert.equal(response.text.trimEnd().split("\n").length, 10001);
        assert.ok(observedStream instanceof QueryStream);
        assert.equal(observedStream.readableObjectMode, true);
        assert.equal(observedStream.readableHighWaterMark, 100);
        assert.ok(cursorReadCount > 1);
        assert.match(observedStream.cursor.text, /LIMIT \$2/);
        assert.deepEqual(observedStream.cursor.values, [monitorId, 10000]);
        assert.equal(observedStream.destroyed, true);
        assert.equal(observer.releaseCount, 1);
    } finally {
        observer.stop();
    }
});

test("CSV export returns a safe error and releases its client when the query fails before rows", async () => {
    const monitorId = await createMonitorForCsv("CSV Query Error");
    const originalConsoleError = console.error;
    console.error = () => {};
    const observer = observeCsvStreams((stream) => {
        stream.cursor.text = "SELECT * FROM missing_csv_test_table WHERE monitor_id = $1 LIMIT $2";
    });

    try {
        const response = await request(app)
            .get(`/monitors/${monitorId}/checks.csv`);

        assert.equal(response.status, 500);
        assert.deepEqual(response.body, {
            error: "Internal Server Error",
            message: "An unexpected error occurred",
        });
        assert.equal(observer.releaseCount, 1);
    } finally {
        observer.stop();
        console.error = originalConsoleError;
    }
});

test("CSV export cancels the cursor and releases its client after client disconnect", async () => {
    const monitorId = await createMonitorForCsv("CSV Client Disconnect");
    await pool.query(
        `INSERT INTO checks (monitor_id, ok, status_code, latency_ms, error)
         VALUES ($1, true, 200, 1, $2)`,
        [monitorId, "x".repeat(1024 * 1024)]
    );

    let observedStream;
    const observer = observeCsvStreams((stream) => {
        observedStream = stream;
    });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        await new Promise((resolve, reject) => {
            const req = http.get(
                `http://127.0.0.1:${server.address().port}/monitors/${monitorId}/checks.csv`,
                (res) => {
                    res.once("data", () => {
                        req.destroy();
                        resolve();
                    });
                }
            );
            req.once("error", (error) => {
                if (error.code === "ECONNRESET") {
                    resolve();
                } else {
                    reject(error);
                }
            });
        });

        await Promise.race([
            observer.released,
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error("CSV client did not release its database client")), 3000);
            }),
        ]);

        assert.equal(observer.releaseCount, 1);
        assert.equal(observedStream.destroyed, true);
    } finally {
        observer.stop();
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
});

test("GET /monitors/:id/checks.csv should return 404 for a non-existent monitor", async () => {
    const response = await request(app)
        .get("/monitors/999999/checks.csv");

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Monitor not found");
});

test("GET /monitors/:id/checks should reject an invalid limit", async () => {
    const response = await request(app)
        .get("/monitors/1/checks?limit=abc");

    assert.equal(response.status, 400);
});

test("GET /monitors/:id/checks should reject a limit above 100", async () => {
    const response = await request(app)
        .get("/monitors/1/checks?limit=101");

    assert.equal(response.status, 400);
});

test("GET /monitors/:id/checks should reject a limit below 1", async () => {
    const response = await request(app)
        .get("/monitors/1/checks?limit=0");

    assert.equal(response.status, 400);
});

test("GET /monitors/:id/checks should reject an invalid after cursor", async () => {
    const response = await request(app)
        .get("/monitors/1/checks?after=abc");

    assert.equal(response.status, 400);
});

test("check pagination accepts the maximum cursor and rejects larger values", async () => {
    const maximumCursor = await request(app)
        .get("/monitors/1/checks?after=2147483647");
    assert.equal(maximumCursor.status, 200);

    const oversizedCursor = await request(app)
        .get("/monitors/1/checks?after=2147483648");
    assert.equal(oversizedCursor.status, 400);

    for (const invalidCursor of ["0", "-1"]) {
        const response = await request(app)
            .get(`/monitors/1/checks?after=${invalidCursor}`);
        assert.equal(response.status, 400, invalidCursor);
    }
});
