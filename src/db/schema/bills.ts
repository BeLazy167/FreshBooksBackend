// src/db/schema/bills.ts
import { pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { providers } from "./providers";

export const bills = pgTable("bills", {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: text("provider_id").references(() => providers.id),
    providerName: text("provider_name").notNull(),
    items: jsonb("items")
        .$type<
            {
                id: string;
                name: string;
                quantity: number;
                price: number;
            }[]
        >()
        .notNull(),
    total: text("total").notNull(),
    date: timestamp("date").defaultNow(),
    signer: text("signer"),
    createdAt: timestamp("created_at").defaultNow(),
});

// Schemas for validation
export const insertBillSchema = createInsertSchema(bills);
export const selectBillSchema = createSelectSchema(bills);

