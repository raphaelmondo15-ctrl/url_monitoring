import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import { checkMonitor } from "../src/scheduler/monitor.scheduler.js";
import pool from "../src/db/pool.js";

test("checkMonitor should record a failed check and open an incident", async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(500, {
            "Content-Type": "text/plain"
        });

        res.end("Internal Server Error");
    });

    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address();

    try {
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
                "Scheduler Test",
                `http://127.0.0.1:${port}`,
                10,
                200
            ]
        );

        const monitor = monitorResult.rows[0];

        const check = await checkMonitor(monitor);

        assert.equal(check.ok, false);
        assert.equal(check.status_code, 500);

        const checkResult = await pool.query(
            `
            SELECT *
            FROM checks
            WHERE monitor_id = $1
            ORDER BY checked_at DESC
            LIMIT 1
        `,
            [monitor.id]
        );

        assert.equal(checkResult.rows.length, 1);
        assert.equal(checkResult.rows[0].ok, false);
        assert.equal(checkResult.rows[0].status_code, 500);

        const incidentResult = await pool.query(
            `
            SELECT *
            FROM incidents
            WHERE monitor_id = $1
              AND resolved_at IS NULL
        `,
            [monitor.id]
        );

        assert.equal(incidentResult.rows.length, 1);
        assert.equal(incidentResult.rows[0].monitor_id, monitor.id);
    } finally {
        await new Promise((resolve) => {
            server.close(resolve);
        });
    }
});
