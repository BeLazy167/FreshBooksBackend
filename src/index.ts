import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Redis } from "@upstash/redis";
import { eq, InferInsertModel, desc } from "drizzle-orm";
import { z } from "zod";
import logger from "./logger";
import { bills, providers, vegetables, signers } from "./schema";

// Type definitions
interface CacheService {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, expireSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
}

interface VegetableItem {
    id?: string;
    name: string;
    quantity: number;
    price: number;
    item_total?: number;
    isAvailable?: boolean;
    hasFixedPrice?: boolean;
    fixedPrice?: number | null;
}

type AsyncRequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<void>;

// Configuration
const CONFIG = {
    CACHE_DURATION: 3600,
    DEFAULT_PORT: 3000,
    PRICE_DECIMALS: 2,
} as const;

// Schema Validations
const vegetableItemSchema = z.object({
    id: z.string().optional(),
    name: z.string(),
    quantity: z.number().positive(),
    price: z.number().positive(),
    item_total: z.number().optional(),
    isAvailable: z.boolean().optional(),
    hasFixedPrice: z.boolean().optional(),
    fixedPrice: z.number().positive().nullish(),
});

const billSchema = z.object({
    providerId: z.string().uuid(),
    providerName: z.string(),
    items: z.array(vegetableItemSchema),
    total: z.number().positive(),
    signer: z.string().optional(),
    date: z
        .union([z.string(), z.date()])
        .transform((val) => new Date(val))
        .optional(),
    createdAt: z
        .union([z.string(), z.date()])
        .transform((val) => new Date(val))
        .optional(),
});

const providerSchema = z.object({
    name: z.string(),
    mobile: z.string(),
    address: z.string().optional(),
});

const vegetableSchema = z.object({
    name: z.string(),
    isAvailable: z.boolean().default(true),
    hasFixedPrice: z.boolean().default(false),
    fixedPrice: z.number().positive().nullish(),
});

const signerSchema = z.object({
    name: z.string(),
});

// Database and Redis Setup
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    retry: {
        retries: 3,
        backoff: (retryCount) => Math.min(Math.exp(retryCount) * 1000, 10000),
    },
});

// Cache Service Implementation
class CacheServiceImpl implements CacheService {
    private readonly redis: Redis;

    constructor(redisClient: Redis) {
        this.redis = redisClient;
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            return await this.redis.get<T>(key);
        } catch (error) {
            logger.error("Cache get error", { key, error });
            return null;
        }
    }

    async set(
        key: string,
        value: any,
        expireSeconds = CONFIG.CACHE_DURATION
    ): Promise<void> {
        try {
            await this.redis.set(key, value, { ex: expireSeconds });
        } catch (error) {
            logger.error("Cache set error", { key, error });
        }
    }

    async del(key: string): Promise<void> {
        try {
            await this.redis.del(key);
        } catch (error) {
            logger.error("Cache delete error", { key, error });
        }
    }
}

const cache = new CacheServiceImpl(redis);

// Vegetable Service
class VegetableService {
    private readonly db: typeof db;

    constructor(database: typeof db) {
        this.db = database;
    }

    async validateAndCreateVegetables(
        items: VegetableItem[]
    ): Promise<VegetableItem[]> {
        const validatedItems: VegetableItem[] = [];
        const batch: InferInsertModel<typeof vegetables>[] = [];

        for (const item of items) {
            const [existingVegetable] = await this.db
                .select()
                .from(vegetables)
                .where(eq(vegetables.name, item.name));

            if (existingVegetable) {
                // Use fixed price if available
                const price =
                    existingVegetable.hasFixedPrice &&
                    existingVegetable.fixedPrice
                        ? Number(existingVegetable.fixedPrice)
                        : item.price;

                const item_total = Number(
                    (price * item.quantity).toFixed(CONFIG.PRICE_DECIMALS)
                );

                validatedItems.push({
                    ...item,
                    id: existingVegetable.id,
                    price,
                    item_total,
                    isAvailable: existingVegetable.isAvailable ?? true,
                    hasFixedPrice: existingVegetable.hasFixedPrice ?? false,
                    fixedPrice: existingVegetable.fixedPrice
                        ? Number(existingVegetable.fixedPrice)
                        : null,
                });
            } else {
                // Create new vegetable
                batch.push({
                    name: item.name,
                    isAvailable: true,
                    hasFixedPrice: false,
                    fixedPrice: null,
                });
            }
        }

        if (batch.length > 0) {
            const newVegetables = await this.db
                .insert(vegetables)
                .values(batch)
                .returning();

            for (const newVeg of newVegetables) {
                const originalItem = items.find(
                    (item) => item.name === newVeg.name
                )!;
                validatedItems.push({
                    ...originalItem,
                    id: newVeg.id,
                    item_total: Number(
                        (originalItem.price * originalItem.quantity).toFixed(
                            CONFIG.PRICE_DECIMALS
                        )
                    ),
                    isAvailable: true,
                    hasFixedPrice: false,
                    fixedPrice: null,
                });
            }
        }

        return validatedItems;
    }
}

const vegetableService = new VegetableService(db);

// Express App Setup
const app = express();

app.use(
    cors({
        origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
        methods: ["GET", "POST", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(express.json({ limit: "10mb" }));

// Security Headers
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
});

// Error Handler Wrapper
const asyncHandler = (fn: AsyncRequestHandler): AsyncRequestHandler => {
    return async (req, res, next) => {
        try {
            await fn(req, res, next);
        } catch (error) {
            next(error);
        }
    };
};

// Rate Limiter
const createRateLimiter = (windowMs: number, max: number) => {
    const requests = new Map<string, { count: number; timestamp: number }>();
    return (req: Request, res: Response, next: NextFunction) => {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();
        const windowStart = now - windowMs;

        const current = requests.get(ip) || { count: 0, timestamp: now };
        if (current.timestamp < windowStart) {
            current.count = 0;
            current.timestamp = now;
        }

        if (current.count >= max) {
            res.status(429).json({ error: "Too many requests" });
            return;
        }

        current.count++;
        requests.set(ip, current);
        next();
    };
};

const billRateLimiter = createRateLimiter(60000, 100);

// Routes

// Vegetable Routes
app.get(
    "/api/vegetables",
    asyncHandler(async (req, res) => {
        const cached = await cache.get<any[]>("vegetables:all");
        if (cached) {
            res.json(cached);
            return;
        }

        const vegetableList = await db.select().from(vegetables);
        await cache.set("vegetables:all", vegetableList);
        res.json(vegetableList);
    })
);

app.post(
    "/api/vegetables",
    asyncHandler(async (req, res) => {
        const validated = vegetableSchema.parse(req.body);

        if (validated.hasFixedPrice && !validated.fixedPrice) {
            throw new Error(
                "Fixed price must be provided when hasFixedPrice is true"
            );
        }

        const [vegetable] = await db
            .insert(vegetables)
            .values({
                ...validated,
                fixedPrice: validated.fixedPrice?.toString(),
            })
            .returning();

        await cache.del("vegetables:all");
        res.status(201).json(vegetable);
    })
);

app.patch(
    "/api/vegetables/:id",
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const validated = vegetableSchema.parse(req.body);

        const [existingVegetable] = await db
            .select()
            .from(vegetables)
            .where(eq(vegetables.id, id));

        if (!existingVegetable) {
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

        await cache.del("vegetables:all");
        res.json(updatedVegetable);
    })
);

// Bill Routes
app.get(
    "/api/bills",
    billRateLimiter,
    asyncHandler(async (req, res) => {
        const cached = await cache.get<any[]>("bills:all");
        if (cached) {
            res.json(cached);
            return;
        }

        const data = await db.select().from(bills).orderBy(desc(bills.date));
        await cache.set("bills:all", data);
        res.json(data);
    })
);

app.get(
    "/api/bills/:id",
    asyncHandler(async (req, res) => {
        const cached = await cache.get<any>(`bill:${req.params.id}`);
        if (cached) {
            res.json(cached);
            return;
        }

        const [bill] = await db
            .select()
            .from(bills)
            .where(eq(bills.id, req.params.id));

        if (!bill) {
            res.status(404).json({ error: "Bill not found" });
            return;
        }

        await cache.set(`bill:${req.params.id}`, bill);
        res.json(bill);
    })
);

app.post(
    "/api/bills",
    asyncHandler(async (req, res) => {
        const now = new Date();
        const billData = {
            ...req.body,
            date: req.body.date || now,
            createdAt: now,
        };

        const validated = billSchema.parse(billData);

        // Validate and process vegetables
        const validatedItems =
            await vegetableService.validateAndCreateVegetables(validated.items);

        // Calculate total considering fixed prices
        const total = Number(
            validatedItems
                .reduce((sum, item) => sum + (item.item_total || 0), 0)
                .toFixed(CONFIG.PRICE_DECIMALS)
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

        await cache.del("bills:all");
        res.status(201).json(bill);
    })
);

// Provider Routes
app.get(
    "/api/providers",
    asyncHandler(async (req, res) => {
        const cached = await cache.get<any[]>("providers:all");
        if (cached) {
            res.json(cached);
            return;
        }

        const providerList = await db.select().from(providers);
        await cache.set("providers:all", providerList);
        res.json(providerList);
    })
);

app.post(
    "/api/providers",
    asyncHandler(async (req, res) => {
        const validated = providerSchema.parse(req.body);
        const [provider] = await db
            .insert(providers)
            .values(validated)
            .returning();

        await cache.del("providers:all");
        res.status(201).json(provider);
    })
);

// Signer Routes
app.get(
    "/api/signers",
    asyncHandler(async (req, res) => {
        const signersList = await db.select().from(signers);
        res.json(signersList);
    })
);

app.post(
    "/api/signers",
    asyncHandler(async (req, res) => {
        const validated = signerSchema.parse(req.body);
        const [signer] = await db.insert(signers).values(validated).returning();
        res.status(201).json(signer);
    })
);

// Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error("Request error", {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    if (err instanceof z.ZodError) {
        res.status(400).json({
            error: "Validation error",
            details: err.errors,
        });
        return;
    }

    res.status(500).json({ error: "Internal server error" });
});

// Server Startup
const server = app.listen(process.env.PORT || CONFIG.DEFAULT_PORT, () => {
    logger.info("Server started", {
        port: process.env.PORT || CONFIG.DEFAULT_PORT,
        nodeEnv: process.env.NODE_ENV,
    });
});

// Graceful Shutdown
process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
        logger.info("Server closed");
        process.exit(0);
    });
});

export default app;
