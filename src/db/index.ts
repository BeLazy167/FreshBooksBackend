// src/db/index.ts
import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as billSchema from "./schema/bills";
import * as providerSchema from "./schema/providers";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
}

const sql: NeonQueryFunction = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
