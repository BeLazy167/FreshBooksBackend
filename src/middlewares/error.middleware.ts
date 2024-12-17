import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import logger from "../utils/logger";

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    logger.error("Request error", {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params,
    });

    if (err instanceof z.ZodError) {
        logger.warn("Validation error", { errors: err.errors });
        res.status(400).json({
            error: "Validation error",
            details: err.errors,
        });
        return;
    }

    res.status(500).json({ error: "Internal server error" });
}; 