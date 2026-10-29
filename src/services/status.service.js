import pool from "../db/pool.js";

export async function getStatus() {
    const result = await pool.query(
        `
        SELECT
            m.id,
            m.name,
            m.url,
            m.is_active,
            c.ok,
            c.checked_at
        FROM monitors m
        LEFT JOIN LATERAL (
            SELECT ok, checked_at
            FROM checks
            WHERE monitor_id = m.id
            ORDER BY checked_at DESC
            LIMIT 1
        ) c ON true
        WHERE m.is_active = true
        ORDER BY m.id ASC
        `
    );

    return result.rows;
}
