import fs from "node:fs/promises";
import pg from "pg";
import pool, { assertSafeTestDatabaseUrl } from "../src/db/pool.js";

const { Pool } = pg;
const testDatabaseUrl = assertSafeTestDatabaseUrl(process.env.DATABASE_URL);

export const testPool = new Pool({
    connectionString: testDatabaseUrl,
});

export async function setupTestDatabase() {
    const databaseResult = await testPool.query(
        "SELECT current_database() AS database_name"
    );

    if (databaseResult.rows[0].database_name !== "url_monitoring_test") {
        throw new Error(
            "Refusing to modify a database other than url_monitoring_test"
        );
    }

    await testPool.query(`
        DROP TABLE IF EXISTS incidents;
        DROP TABLE IF EXISTS checks;
        DROP TABLE IF EXISTS monitors;
    `);

    const schema = await fs.readFile(
        new URL("../src/sql/schema.sql", import.meta.url),
        "utf8"
    );
    await testPool.query(schema);
}

export async function cleanTestDatabase() {
    await testPool.query(`
        TRUNCATE TABLE incidents, checks, monitors RESTART IDENTITY CASCADE;
    `);
}

export async function closeTestDatabase() {
    await Promise.all([testPool.end(), pool.end()]);
}