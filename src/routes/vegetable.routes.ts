import { Router } from "express";
import { asyncHandler } from "../utils/async-handler";
import { vegetableSchema } from "../validators/schemas";
import { db } from "../db";
import { vegetables } from "../schema";
import { eq } from "drizzle-orm";
import { cache } from "../services/cache.service";
import logger from "../utils/logger";

const router = Router();

router.get(
    "/",
    asyncHandler(async (req, res) => {
        logger.info("Fetching all vegetables");
        
        const cached = await cache.get<any[]>("vegetables:all");
        if (cached) {
            logger.info("Returning cached vegetables", { count: cached.length });
            res.json(cached);
            return;
        }

        const vegetableList = await db.select().from(vegetables);
        logger.info("Fetched vegetables from database", { count: vegetableList.length });
        
        await cache.set("vegetables:all", vegetableList);
        res.json(vegetableList);
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        logger.info("Creating new vegetable", { body: req.body });
        
        const validated = vegetableSchema.parse(req.body);

        if (validated.hasFixedPrice && !validated.fixedPrice) {
            logger.warn("Invalid fixed price configuration");
            throw new Error("Fixed price must be provided when hasFixedPrice is true");
        }

        const [vegetable] = await db
            .insert(vegetables)
            .values({
                ...validated,
                fixedPrice: validated.fixedPrice?.toString(),
            })
            .returning();

        logger.info("Created new vegetable", { vegetable });
        await cache.del("vegetables:all");
        res.status(201).json(vegetable);
    })
);

router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        logger.info("Updating vegetable", { id, updates: req.body });
        
        const validated = vegetableSchema.parse(req.body);

        const [existingVegetable] = await db
            .select()
            .from(vegetables)
            .where(eq(vegetables.id, id));

        if (!existingVegetable) {
            logger.warn("Vegetable not found", { id });
            res.status(404).json({ error: "Vegetable not found" });
            return;
        }

        const [updatedVegetable] = await db
            .update(vegetables)
            .set({
                ...validated,
                fixedPrice: validated.fixedPrice?.toString(),
            })
            .where(eq(vegetables.id, id))
            .returning();

        logger.info("Updated vegetable", { id, vegetable: updatedVegetable });
        await cache.del("vegetables:all");
        res.json(updatedVegetable);
    })
);

export default router;