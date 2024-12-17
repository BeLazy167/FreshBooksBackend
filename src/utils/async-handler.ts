import { AsyncRequestHandler } from "../interfaces";
import logger from "./logger";

export const asyncHandler = (fn: AsyncRequestHandler): AsyncRequestHandler => {
    return async (req, res, next) => {
        try {
            logger.debug("Handling async request", {
                path: req.path,
                method: req.method,
                query: req.query,
                params: req.params,
            });

            await fn(req, res, next);

            logger.debug("Async request completed", {
                path: req.path,
                method: req.method,
            });
        } catch (error) {
            logger.error("Async handler error", {
                path: req.path,
                method: req.method,
                error,
            });
            next(error);
        }
    };
};
