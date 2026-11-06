// Load environment variables before importing the pool
import "dotenv/config";

import pool from "./db.js";

async function testConnection() {
    try {
        const [rows] = await pool.execute(`
            SELECT
                VERSION() AS mysql_version,
                DATABASE() AS database_name,
                CURRENT_USER() AS database_user
        `);

        console.log("Database connection successful!");
        console.table(rows);

    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exitCode = 1;

    } finally {
        await pool.end();
    }
}

testConnection();