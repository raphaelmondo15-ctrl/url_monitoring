import pool from "../db/pool.js";
import { encodeIncidentCursor } from "../schemas/incident-pagination.schema.js";

export async function handleIncident(monitorId, check) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `SELECT *
             FROM incidents
             WHERE monitor_id = $1
               AND resolved_at IS NULL
             FOR UPDATE`,
            [monitorId]
        );

        const openIncident = result.rows[0] ?? null;

        if (!check.ok && !openIncident) {
            await client.query(
                `INSERT INTO incidents (
                    monitor_id,
                    cause
                )
                VALUES ($1, $2)`,
                [monitorId, check.error ?? `Expected status ${check.status_code}`]
            );
        }

        if (check.ok && openIncident) {
            await client.query(
                `UPDATE incidents
                 SET resolved_at = now()
                 WHERE id = $1`,
                [openIncident.id]
            );
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

function createIncidentPage(rows, limit) {
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(({ cursor_started_at, ...incident }) => incident);
    const lastRow = pageRows.at(-1);

    return {
        items,
        next_cursor: hasMore
            ? encodeIncidentCursor({
                started_at: lastRow.cursor_started_at,
                id: lastRow.id,
            })
            : null,
    };
}

async function queryIncidents({ monitorId, after, limit }) {
    const values = [];
    const conditions = [];

    if (monitorId !== undefined) {
        values.push(monitorId);
        conditions.push(`monitor_id = $${values.length}`);
    }

    if (after !== undefined) {
        values.push(after.started_at);
        const timestampParameter = `$${values.length}::timestamptz`;
        values.push(after.id);
        const idParameter = `$${values.length}::integer`;
        conditions.push(
            `(started_at < ${timestampParameter}
              OR (started_at = ${timestampParameter} AND id < ${idParameter}))`
        );
    }

    let query = `
        SELECT incidents.*,
               to_char(
                   started_at AT TIME ZONE 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
               ) AS cursor_started_at
        FROM incidents`;

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
    }

    values.push(limit + 1);
    query += ` ORDER BY started_at DESC, id DESC LIMIT $${values.length}`;

    const result = await pool.query(query, values);
    return createIncidentPage(result.rows, limit);
}

export async function getIncidents({ after, limit }) {
    return queryIncidents({ after, limit });
}

export async function getIncidentsByMonitorId(monitorId, { after, limit }) {
    return queryIncidents({ monitorId, after, limit });
}