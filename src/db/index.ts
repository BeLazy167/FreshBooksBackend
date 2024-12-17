import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import logger from "../utils/logger";

logger.info("Initializing database connection");

export const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);

logger.info("Database connection initialized");
