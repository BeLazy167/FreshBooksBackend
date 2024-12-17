import express from "express";
import cors from "cors";
import logger from "./utils/logger";
import { CONFIG, CORS_CONFIG } from "./config";
import { securityHeaders } from "./middlewares/security.middleware";
import { errorHandler } from "./middlewares/error.middleware";
import vegetableRoutes from "./routes/vegetable.routes";
import billRoutes from "./routes/bill.routes";
import providerRoutes from "./routes/provider.routes";
import signerRoutes from "./routes/signer.routes";
import { cache } from "./services/cache.service";

logger.info("Starting application initialization");

const app = express();

// Middleware setup
app.use(cors(CORS_CONFIG));
app.use(express.json({ limit: "10mb" }));
app.use(securityHeaders);

logger.info("Middleware configured");

// Routes setup
app.use("/api/vegetables", vegetableRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/signers", signerRoutes);

logger.info("Routes configured");

// Cache reset endpoint
app.get("/api/cache/reset", async (req, res) => {
    logger.info("Resetting cache");

    try {
        const keys = await cache.getKeys();
        await Promise.all(keys.map((key) => cache.del(key)));
        logger.info("Cache reset successful", { keysCleared: keys.length });
        res.status(200).json({
            message: "Cache reset successful",
            keysCleared: keys.length,
        });
    } catch (error) {
        logger.error("Cache reset failed", { error });
        throw error;
    }
});

// Error handling
app.use(errorHandler);

// Server startup
const server = app.listen(process.env.PORT || CONFIG.DEFAULT_PORT, () => {
    logger.info("Server started", {
        port: process.env.PORT || CONFIG.DEFAULT_PORT,
        nodeEnv: process.env.NODE_ENV,
    });
});

// Graceful shutdown
process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
        logger.info("Server closed");
        process.exit(0);
    });
});

process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error });
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason });
    process.exit(1);
});

export default app;
