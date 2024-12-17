import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

export const createRateLimiter = (windowMs: number, max: number) => {
    const requests = new Map<string, { count: number; timestamp: number }>();
    
    return (req: Request, res: Response, next: NextFunction) => {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();
        const windowStart = now - windowMs;

        logger.debug("Rate limit check", { ip, path: req.path });

        const current = requests.get(ip) || { count: 0, timestamp: now };
        if (current.timestamp < windowStart) {
            current.count = 0;
            current.timestamp = now;
        }

        if (current.count >= max) {
            logger.warn("Rate limit exceeded", { ip, path: req.path });
            res.status(429).json({ error: "Too many requests" });
            return;
        }

        current.count++;
        requests.set(ip, current);
        logger.debug("Rate limit updated", { 
            ip, 
            currentCount: current.count,
            limit: max 
        });
        
        next();
    };
}; 