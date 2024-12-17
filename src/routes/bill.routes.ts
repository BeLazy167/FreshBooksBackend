import { Router } from "express";
import { asyncHandler } from "../utils/async-handler";
import { billSchema } from "../validators/schemas";
import { db } from "../db";
import { bills } from "../schema";
import { eq, desc } from "drizzle-orm";
import { cache } from "../services/cache.service";
import logger from "../utils/logger";
import { createRateLimiter } from "../middlewares/rate-limiter.middleware";
import { vegetableService } from "../services/vegetable.service";
const router = Router();
const billRateLimiter = createRateLimiter(60000, 100);

router.get(
    "/",
    billRateLimiter,
    asyncHandler(async (req, res) => {
        logger.info("Fetching all bills");
        
        const cached = await cache.get<any[]>("bills:all");
        if (cached) {
            logger.info("Returning cached bills", { count: cached.length });
            res.json(cached);
            return;
        }

        const data = await db.select().from(bills).orderBy(desc(bills.date));
        logger.info("Fetched bills from database", { count: data.length });
        
        await cache.set("bills:all", data);
        res.json(data);
    })
);

router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        logger.info("Fetching bill by id", { id });

        const cached = await cache.get<any>(`bill:${id}`);
        if (cached) {
            logger.info("Returning cached bill", { id });
            res.json(cached);
            return;
        }

        const [bill] = await db
            .select()
            .from(bills)
            .where(eq(bills.id, id));

        if (!bill) {
            logger.warn("Bill not found", { id });
            res.status(404).json({ error: "Bill not found" });
            return;
        }

        logger.info("Found bill", { id });
        await cache.set(`bill:${id}`, bill);
        res.json(bill);
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        logger.info("Creating new bill", { body: req.body });
        
        const now = new Date();
        const billData = {
            ...req.body,
            date: req.body.date || now,
            createdAt: now,
        };

        const validated = billSchema.parse(billData);
        logger.debug("Bill data validated", { validated });

        // Validate and process vegetables
        const validatedItems = await vegetableService.validateAndCreateVegetables(
            validated.items
        );
        logger.debug("Items validated", { itemCount: validatedItems.length });

        // Calculate total
        const total = Number(
            validatedItems
                .reduce((sum, item) => sum + (item.item_total || 0), 0)
                .toFixed(2)
        );

        const [bill] = await db
            .insert(bills)
            .values({
                ...validated,
                items: validatedItems,
                total: total.toString(),
                date: new Date(),
                createdAt: new Date(),
            })
            .returning();

        logger.info("Bill created successfully", { 
            billId: bill.id, 
            total, 
            itemCount: validatedItems.length 
        });

        await cache.del("bills:all");
        res.status(201).json(bill);
    })
);

router.delete(
    "/test-provider",
    asyncHandler(async (req, res) => {
        logger.info("Attempting to delete all bills for provider Test");

        const deletedBills = await db
            .delete(bills)
            .where(eq(bills.providerName, "Test"))
            .returning();

        logger.info("Bills deleted for provider Test", { 
            count: deletedBills.length,
            billIds: deletedBills.map(b => b.id)
        });

        // Clear cache
        await cache.del("bills:all");
        deletedBills.forEach(async (bill) => {
            await cache.del(`bill:${bill.id}`);
        });

        res.json({ 
            message: "Bills deleted successfully", 
            count: deletedBills.length,
            deletedBills 
        });
    })
);

export default router;