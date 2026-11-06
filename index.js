import "dotenv/config";
import express from "express";
import pool from "./db.js";
import router from "./router.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Parse incoming JSON request bodies.
app.use(express.json());

// Temporary health-check endpoint.
app.get("/health", async (req, res, next) => {
    try {
        await pool.execute("SELECT 1");

        res.status(200).json({
            status: "ok",
            database: "connected"
        });
    } catch (error) {
        next(error);
    }
});

// Mount API routes.
app.use("/api", router);

// Handle unknown routes.
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found"
    });
});

// Central error handler.
app.use((err, req, res, next) => {
    console.error("Application error:", err.message);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        error: "Internal server error"
    });
});

// Verify MySQL before starting the server.
async function startServer() {
    try {
        await pool.execute("SELECT 1");

        const server = app.listen(PORT, () => {
            console.log(`Bank API running on port ${PORT}`);
        });

        // Close HTTP and database connections cleanly.
        const shutdown = (signal) => {
            console.log(`${signal} received. Closing server.`);

            server.close(async () => {
                await pool.end();
                console.log("Server and database pool closed.");
            });
        };

        process.once("SIGINT", () => shutdown("SIGINT"));
        process.once("SIGTERM", () => shutdown("SIGTERM"));

    } catch (error) {
        console.error("Server startup failed:", error.message);

        await pool.end();
        process.exitCode = 1;
    }
}

startServer();