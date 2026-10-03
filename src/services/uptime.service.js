import pool from "../db/pool.js";

export async function getMonitorUptime(monitorId, window) {
    const result = await pool.query(
        `
        SELECT
            COUNT(*) FILTER (WHERE ok = true) * 100.0
                / NULLIF(COUNT(*), 0) AS uptime_percentage,
            AVG(latency_ms) AS average_latency_ms,
            PERCENTILE_CONT(0.95)
                WITHIN GROUP (ORDER BY latency_ms)
                FILTER (WHERE latency_ms IS NOT NULL) AS p95_latency_ms
        FROM checks
        WHERE monitor_id = $1
          AND checked_at >= now() - $2::interval
        `,
        [monitorId, window]
    );

    const row = result.rows[0];

    return {
        uptime_percentage: row.uptime_percentage
            ? Number(row.uptime_percentage)
            : 0,
        average_latency_ms: row.average_latency_ms
            ? Number(row.average_latency_ms)
            : 0,
        p95_latency_ms: row.p95_latency_ms
            ? Number(row.p95_latency_ms)
            : 0
    };
}