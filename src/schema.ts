import { pgTable, text, timestamp, jsonb, uuid, numeric } from 'drizzle-orm/pg-core';

export const bills = pgTable('bills', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerId: text('provider_id').notNull(),
  providerName: text('provider_name').notNull(),
  items: jsonb('items').notNull(),
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  date: timestamp('date').defaultNow(),
  signer: text('signer'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const providers = pgTable('providers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  mobile: text('mobile').notNull(),
  address: text('address'),
});
