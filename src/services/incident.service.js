import pool from "../db/pool.js";

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
