import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

export const securityHeaders = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    logger.debug("Applying security headers", { path: req.path });
    
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    
    next();
}; 