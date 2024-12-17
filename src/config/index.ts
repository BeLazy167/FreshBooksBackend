export const CONFIG = {
    CACHE_DURATION: 3600,
    DEFAULT_PORT: 3000,
    PRICE_DECIMALS: 2,
} as const;

export const CORS_CONFIG = {
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
};
