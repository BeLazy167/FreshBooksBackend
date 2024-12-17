import { Router } from "express";
import { asyncHandler } from "../utils/async-handler";
import { providerSchema } from "../validators/schemas";
import { db } from "../db";
import { providers } from "../schema";
import { cache } from "../services/cache.service";
import logger from "../utils/logger";

const router = Router();

router.get(
    "/",
    asyncHandler(async (req, res) => {
        logger.info("Fetching all providers");
        
        const cached = await cache.get<any[]>("providers:all");
        if (cached) {
            logger.info("Returning cached providers", { count: cached.length });
            res.json(cached);
            return;
        }

        const providerList = await db.select().from(providers);
        logger.info("Fetched providers from database", { count: providerList.length });
        
        await cache.set("providers:all", providerList);
        res.json(providerList);
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        logger.info("Creating new provider", { body: req.body });
        
        const validated = providerSchema.parse(req.body);
        const [provider] = await db
            .insert(providers)
            .values(validated)
            .returning();

        logger.info("Provider created successfully", { providerId: provider.id });
        await cache.del("providers:all");
        res.status(201).json(provider);
    })
);


export default router;