import { Redis } from "@upstash/redis";
import { CacheService } from "../interfaces";
import logger from "../utils/logger";
import { CONFIG } from "../config";

export class CacheServiceImpl implements CacheService {
    private readonly redis: Redis;

    constructor(redisClient: Redis) {
        this.redis = redisClient;
        logger.info("Cache service initialized", { 
            cacheDuration: CONFIG.CACHE_DURATION,
            redisUrl: process.env.UPSTASH_REDIS_REST_URL?.split("@")[1] // Log only host part
        });
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            logger.debug("Cache get attempt", { key });
            const result = await this.redis.get<T>(key);
            if (result) {
                logger.info("Cache hit", { key, valueType: typeof result });
            } else {
                logger.debug("Cache miss", { key });
            }
            return result;
        } catch (error) {
            logger.error("Cache get error", { 
                key, 
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            return null;
        }
    }

    async set(
        key: string,
        value: any,
        expireSeconds = CONFIG.CACHE_DURATION
    ): Promise<void> {
        try {
            logger.debug("Cache set attempt", { 
                key, 
                valueType: typeof value,
                expireSeconds 
            });
            await this.redis.set(key, value, { ex: expireSeconds });
            logger.info("Cache set successful", { 
                key, 
                valueSize: JSON.stringify(value).length,
                ttl: expireSeconds
            });
        } catch (error) {
            logger.error("Cache set error", { 
                key,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }

    async del(key: string): Promise<void> {
        try {
            logger.debug("Cache delete attempt", { key });
            await this.redis.del(key);
            logger.info("Cache delete successful", { key });
        } catch (error) {
            logger.error("Cache delete error", { 
                key,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }

    async getKeys(): Promise<string[]> {
        try {
            logger.debug("Fetching all cache keys");
            const keys = await this.redis.keys("*");
            logger.info("Cache keys retrieved", { count: keys.length });
            return keys;
        } catch (error) {
            logger.error("Get keys error", { 
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            return [];
        }
    }
}

// Initialize Redis client
logger.info("Initializing Redis client");
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Export cache instance
export const cache = new CacheServiceImpl(redis);