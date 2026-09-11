import pool from '../db/pool.js';

export async function createMonitor(monitorData) {
    const {
        name,
        url,
        interval_seconds,
        expected_status
    } = monitorData;

    const result = await pool.query(
        `INSERT INTO monitors (
            name,
            url,
            interval_seconds,
            expected_status
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [
            name,
            url,
            interval_seconds,
            expected_status,
        ]
    );

    return result.rows[0];
    }
