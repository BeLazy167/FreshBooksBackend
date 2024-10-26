/**
 * @fileoverview Express server application for managing bills, providers, and vegetables
 * with caching and database integration.
 * @author [BeLazy167]
 * @version 1.0.0
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Redis } from "@upstash/redis";
import { eq, InferInsertModel } from "drizzle-orm";
import {
    createSampleProviders,
    createSampleBills,
    Provider,
} from "./utils/createSampleData";
import { bills, providers, vegetables, signers } from "./schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Interface for cache operations
 * @interface CacheService
 */
interface CacheService {
    /**
     * Retrieves a value from cache
     * @template T - The type of cached value
     * @param {string} key - Cache key
     * @returns {Promise<T | null>} Cached value or null if not found
     */
    get<T>(key: string): Promise<T | null>;

    /**
     * Sets a value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} [expireSeconds] - Cache expiration time in seconds
     * @returns {Promise<void>}
     */
    set(key: string, value: any, expireSeconds?: number): Promise<void>;

    /**
     * Deletes a value from cache
     * @param {string} key - Cache key to delete
     * @returns {Promise<void>}
     */
    del(key: string): Promise<void>;
}

/**
 * Represents a vegetable item with availability status
 * @extends {z.infer<typeof vegetableItemSchema>}
 */
interface VegetableItem extends z.infer<typeof vegetableItemSchema> {
    isAvailable?: boolean;
}

/**
 * Type definition for async request handlers
 */
type AsyncRequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<void>;

/**
 * Application configuration constants
 * @constant
 */
const CONFIG = {
    /** Cache duration in seconds */
    CACHE_DURATION: 3600,
    /** Default server port */
    DEFAULT_PORT: 3000,
    /** Decimal places for price calculations */
    PRICE_DECIMALS: 2,
} as const;

/**
 * Schema validation for vegetable items
 * @constant
 */
const vegetableItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number().positive(),
    price: z.number().positive(),
    item_total: z.number(),
});

/**
 * Schema validation for bills
 * @constant
 */
const billSchema = createInsertSchema(bills).extend({
    items: z.array(vegetableItemSchema),
    total: z.number().positive(),
});

/**
 * Schema validation for providers
 * @constant
 */
const providerSchema = createInsertSchema(providers);

// Database setup with connection pooling
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);
type VegetableInsert = InferInsertModel<typeof vegetables>;

/**
 * Redis client configuration with retry logic
 */
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    retry: {
        retries: 3,
        backoff: (retryCount) => Math.min(Math.exp(retryCount) * 1000, 10000),
    },
});

/**
 * Implementation of the CacheService interface using Redis
 * @class CacheServiceImpl
 * @implements {CacheService}
 */
class CacheServiceImpl implements CacheService {
    private readonly redis: Redis;

    /**
     * Creates an instance of CacheServiceImpl
     * @param {Redis} redisClient - Redis client instance
     */
    constructor(redisClient: Redis) {
        this.redis = redisClient;
    }

    /**
     * @inheritdoc
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            return await this.redis.get<T>(key);
        } catch (error) {
            console.error(`Cache get error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * @inheritdoc
     */
    async set(
        key: string,
        value: any,
        expireSeconds = CONFIG.CACHE_DURATION
    ): Promise<void> {
        try {
            await this.redis.set(key, value, { ex: expireSeconds });
        } catch (error) {
            console.error(`Cache set error for key ${key}:`, error);
        }
    }

    /**
     * @inheritdoc
     */
    async del(key: string): Promise<void> {
        try {
            await this.redis.del(key);
        } catch (error) {
            console.error(`Cache delete error for key ${key}:`, error);
        }
    }
}

const cache = new CacheServiceImpl(redis);

/**
 * Service for managing vegetable-related operations
 * @class VegetableService
 */
class VegetableService {
    private readonly db: typeof db;

    /**
     * Creates an instance of VegetableService
     * @param {typeof db} database - Database instance
     */
    constructor(database: typeof db) {
        this.db = database;
    }

    /**
     * Validates and creates vegetables in batch
     * @param {VegetableItem[]} items - Array of vegetable items to process
     * @returns {Promise<VegetableItem[]>} Processed and validated items
     * @throws {Error} If vegetable name mismatch occurs
     */
    async validateAndCreateVegetables(
        items: VegetableItem[]
    ): Promise<VegetableItem[]> {
        const validatedItems: VegetableItem[] = [];
        const batch: VegetableInsert[] = [];

        for (const item of items) {
            const item_total = Number(
                (item.price * item.quantity).toFixed(CONFIG.PRICE_DECIMALS)
            );

            const [existingVegetable] = await this.db
                .select()
                .from(vegetables)
                .where(eq(vegetables.name, item.name));

            if (existingVegetable) {
                if (existingVegetable.name !== item.name) {
                    throw new Error(
                        `Vegetable name mismatch: ${item.name} (ID: ${existingVegetable.id})`
                    );
                }
                validatedItems.push({
                    ...item,
                    id: existingVegetable.id,
                    isAvailable: existingVegetable.isAvailable ?? false,
                    item_total,
                });
            } else {
                batch.push({
                    name: item.name,
                    isAvailable: false,
                } satisfies typeof vegetables.$inferInsert);
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
                    isAvailable: false,
                    item_total: Number(
                        (originalItem.price * originalItem.quantity).toFixed(
                            CONFIG.PRICE_DECIMALS
                        )
                    ),
                });
            }
        }

        return validatedItems;
    }
}

const vegetableService = new VegetableService(db);

/**
 * Initializes sample data with retry mechanism
 * @param {number} [retries=3] - Number of retry attempts
 * @returns {Promise<void>}
 * @throws {Error} If initialization fails after all retries
 */
const initializeSampleData = async (retries = 3): Promise<void> => {
    try {
        const existingProviders = await db.select().from(providers);
        if (existingProviders.length === 0) {
            const sampleProviders = createSampleProviders(5);
            await db.insert(providers).values(sampleProviders);
        }

        const existingBills = await db.select().from(bills);
        if (existingBills.length === 0) {
            const providerList = await db.select().from(providers);
            if (providerList.length > 0) {
                const sampleBills = createSampleBills(
                    100,
                    providerList as Provider[]
                );
                for (const bill of sampleBills) {
                    const validatedItems =
                        await vegetableService.validateAndCreateVegetables(
                            bill.items as VegetableItem[]
                        );
                    await db.insert(bills).values({
                        ...bill,
                        items: validatedItems,
                        total: bill.total.toString(),
                    });
                }
            }
        }
    } catch (error) {
        if (retries > 0) {
            console.warn(
                `Retrying sample data initialization. Attempts remaining: ${
                    retries - 1
                }`
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await initializeSampleData(retries - 1);
        } else {
            console.error("Failed to initialize sample data:", error);
            throw error;
        }
    }
};

// Express app setup with security middleware
const app = express();

/**
 * CORS configuration
 */
app.use(
    cors({
        origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

/**
 * Request body size limit configuration
 */
app.use(express.json({ limit: "10mb" }));

/**
 * Security headers middleware
 */
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
});

/**
 * Wraps async request handlers with error catching
 * @param {AsyncRequestHandler} fn - Async request handler function
 * @returns {AsyncRequestHandler} Wrapped handler with error catching
 */
const asyncHandler = (fn: AsyncRequestHandler): AsyncRequestHandler => {
    return async (req, res, next) => {
        try {
            await fn(req, res, next);
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Creates a rate limiter middleware
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} max - Maximum number of requests allowed in the window
 * @returns {(req: Request, res: Response, next: NextFunction) => void} Rate limiter middleware
 */
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

const billRateLimiter = createRateLimiter(60000, 100); // 100 requests per minute

// Route Handlers
/**
 * GET /api/bills - Retrieves all bills
 */
app.get(
    "/api/bills",
    billRateLimiter,
    asyncHandler(async (req, res) => {
        const cached = await cache.get<any[]>("bills:all");
        if (cached) {
            res.json(cached);
            return;
        }

        const data = await db.select().from(bills);
        await cache.set("bills:all", data);
        res.json(data);
    })
);

/**
 * GET /api/bills/:id - Retrieves a specific bill
 */
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

/**
 * POST /api/bills - Creates a new bill
 */
app.post(
    "/api/bills",
    asyncHandler(async (req, res) => {
        const billData = billSchema.parse(req.body);

        const total = Number(
            billData.items
                .reduce((sum, item) => sum + item.price * item.quantity, 0)
                .toFixed(CONFIG.PRICE_DECIMALS)
        );

        const validatedItems =
            await vegetableService.validateAndCreateVegetables(billData.items);

        const [bill] = await db
            .insert(bills)
            .values({
                ...billData,
                items: validatedItems,
                total: total.toString(),
            })
            .returning();
        await cache.del("bills:all");
        res.status(201).json(bill);
    })
);

// Provider routes
/**
 * GET /api/providers - Retrieves all providers
 */
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

/**
 * POST /api/providers - Creates a new provider
 */
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

/**
 * GET /api/vegetables - Retrieves all vegetables
 */
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

// Enhanced error handler with detailed logging
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Error details:", {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
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

// Graceful shutdown handling
const server = app.listen(process.env.PORT || CONFIG.DEFAULT_PORT, () => {
    initializeSampleData()
        .then(() =>
            console.log(
                `Server running on port ${
                    process.env.PORT || CONFIG.DEFAULT_PORT
                }`
            )
        )
        .catch(console.error);
});

process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
        console.log("Server closed");
        process.exit(0);
    });
});

export default app;
