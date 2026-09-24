import pool from "../db/pool.js";

export async function createCheck({
    monitor_id,
    ok,
    status_code,
    latency_ms,
    error
}) {
    const result = await pool.query(
        `INSERT INTO checks (
            monitor_id,
            ok,
            status_code,
            latency_ms,
            error
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
            monitor_id,
            ok,
            status_code,
            latency_ms,
            error
        ]
    );

    return result.rows[0];
}
