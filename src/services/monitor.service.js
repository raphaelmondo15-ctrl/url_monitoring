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

// export async function getMonitors({ after, limit }) {
//     const values = [];
//     let query = 'SELECT * FROM monitors';
    
//     if (after !== undefined) {
//         query += ' WHERE id > $1';
//         values.push(after);
//     }

//     query += `ORDER BY id ASC LIMIT $${values.length + 1}`;
//     values.push(limit + 1);

//     const result = await pool.query(query, values);

//     const hasMore = result.rows.length > limit;
//     const items = hasMore ? result.rows.slice(0, limit) : result.rows;

//     const nextCursor = hasMore ? items[items.length - 1].id : null;

//     return {
//         items,
//         nextCursor,
//     };
// }

export async function getMonitors({ after, limit }) {
    const values = [];
    let query = 'SELECT * FROM monitors';

    if (after !== undefined) {
        query += ' WHERE id > $1';
        values.push(after);
    }

    query += ` ORDER BY id ASC LIMIT $${values.length + 1}`;
    values.push(limit + 1);

    const result = await pool.query(query, values);

    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;

    const nextCursor = hasMore
        ? items[items.length - 1].id
        : null;

    return {
        items,
        next_cursor: nextCursor,
    };
}