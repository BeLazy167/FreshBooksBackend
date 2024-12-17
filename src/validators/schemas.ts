import { z } from "zod";

export const vegetableItemSchema = z.object({
    id: z.string().optional(),
    name: z.string(),
    quantity: z.number().positive(),
    price: z.number().positive(),
    item_total: z.number().optional(),
    isAvailable: z.boolean().optional(),
    hasFixedPrice: z.boolean().optional(),
    fixedPrice: z.number().positive().nullish(),
});

export const billSchema = z.object({
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

export const providerSchema = z.object({
    name: z.string(),
    mobile: z.string(),
    address: z.string().optional(),
});

export const vegetableSchema = z.object({
    name: z.string(),
    isAvailable: z.boolean().default(true),
    hasFixedPrice: z.boolean().default(false),
    fixedPrice: z.number().positive().nullish(),
});

export const signerSchema = z.object({
    name: z.string(),
}); 