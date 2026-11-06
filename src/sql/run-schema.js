import fs from "fs/promises";
import pool from "../db/pool.js";

try {
    const schema = await fs.readFile(new URL("./schema.sql", import.meta.url), "utf8");
    await pool.query(schema);
    console.log("Database schema created successfully.");
} catch (error) {
    console.error("Error creating database schema:", error);
    process.exitCode = 1;
} finally {
    await pool.end();
}