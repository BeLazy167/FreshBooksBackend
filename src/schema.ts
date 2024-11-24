import {
    pgTable,
    text,
    timestamp,
    jsonb,
    uuid,
    numeric,
    boolean,
} from "drizzle-orm/pg-core";

export const vegetables = pgTable("vegetables", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    // flag if the vegetable is available in the db
    isAvailable: boolean("is_available").default(true),
    hasFixedPrice: boolean("has_fixed_price").default(false),
    fixedPrice: numeric("fixed_price", { precision: 10, scale: 2 }),
});

export const bills = pgTable("bills", {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: uuid("provider_id")
        .notNull()
        .references(() => providers.id),
    providerName: text("provider_name").notNull(),
    items: jsonb("items").notNull(),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    date: timestamp("date").defaultNow(),
    signer: text("signer").references(() => signers.name),
    createdAt: timestamp("created_at").defaultNow(),
});

export const providers = pgTable("providers", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    mobile: text("mobile").notNull(),
    address: text("address"),
});

export const signers = pgTable("signers", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(),
});
