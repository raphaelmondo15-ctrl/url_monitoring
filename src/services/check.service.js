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

export async function getChecksByMonitorId(monitorId, { after, limit }) {
    const values = [monitorId];
    let query = `
        SELECT *
        FROM checks
        WHERE monitor_id = $1
    `;

    if (after !== undefined) {
        query += ` AND id > $2`;
        values.push(after);
    }

    query += ` ORDER BY id ASC LIMIT $${values.length + 1}`;
    values.push(limit + 1);

    const result = await pool.query(query, values);

    const hasMore = result.rows.length > limit;

    const items = hasMore
        ? result.rows.slice(0, limit)
        : result.rows;

    const nextCursor = hasMore
        ? items[items.length - 1].id
        : null;

    return {
        items,
        next_cursor: nextCursor
    };
}
