import { drizzle } from "drizzle-orm/neon-http";
import { eq, InferInsertModel } from "drizzle-orm";
import { vegetables } from "../schema";
import { VegetableItem, VegetableService } from "../interfaces";
import { CONFIG } from "../config";
import logger from "../utils/logger";
import { db } from "../db";

export class VegetableServiceImpl implements VegetableService {
    private readonly db: ReturnType<typeof drizzle>;

    constructor(database: ReturnType<typeof drizzle>) {
        this.db = database;
        logger.info("Vegetable service initialized", {
            priceDecimals: CONFIG.PRICE_DECIMALS
        });
    }

    async validateAndCreateVegetables(items: VegetableItem[]): Promise<VegetableItem[]> {
        logger.info("Starting vegetable validation", { 
            itemCount: items.length,
            items: items.map(i => ({ name: i.name, quantity: i.quantity }))
        });

        const validatedItems: VegetableItem[] = [];
        const batch: InferInsertModel<typeof vegetables>[] = [];

        for (const item of items) {
            logger.debug("Processing vegetable", { 
                name: item.name,
                quantity: item.quantity,
                price: item.price
            });

            const [existingVegetable] = await this.db
                .select()
                .from(vegetables)
                .where(eq(vegetables.name, item.name));

            if (existingVegetable) {
                logger.debug("Found existing vegetable", {
                    id: existingVegetable.id,
                    name: existingVegetable.name,
                    hasFixedPrice: existingVegetable.hasFixedPrice,
                    fixedPrice: existingVegetable.fixedPrice
                });

                const price = item.price;
                const item_total = Number(
                    (price * item.quantity).toFixed(CONFIG.PRICE_DECIMALS)
                );

                logger.debug("Calculated item total", {
                    name: item.name,
                    price,
                    quantity: item.quantity,
                    total: item_total
                });

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
                logger.info("New vegetable found", { name: item.name });
                batch.push({
                    name: item.name,
                    isAvailable: true,
                    hasFixedPrice: false,
                    fixedPrice: null,
                });
            }
        }

        if (batch.length > 0) {
            logger.info("Creating new vegetables", { 
                count: batch.length,
                vegetables: batch.map(v => v.name)
            });

            const newVegetables = await this.db
                .insert(vegetables)
                .values(batch)
                .returning();

            logger.debug("New vegetables created", {
                count: newVegetables.length,
                ids: newVegetables.map(v => v.id)
            });

            for (const newVeg of newVegetables) {
                const originalItem = items.find(
                    (item) => item.name === newVeg.name
                )!;

                const item_total = Number(
                    (originalItem.price * originalItem.quantity).toFixed(
                        CONFIG.PRICE_DECIMALS
                    )
                );

                logger.debug("Processing new vegetable", {
                    id: newVeg.id,
                    name: newVeg.name,
                    total: item_total
                });

                validatedItems.push({
                    ...originalItem,
                    id: newVeg.id,
                    item_total,
                    isAvailable: true,
                    hasFixedPrice: false,
                    fixedPrice: null,
                });
            }
        }

        logger.info("Vegetable validation completed", { 
            validatedCount: validatedItems.length,
            newCount: batch.length,
            totalValue: validatedItems.reduce((sum, item) => sum + (item.item_total || 0), 0)
        });

        return validatedItems;
    }
}

logger.info("Creating vegetable service instance");
export const vegetableService = new VegetableServiceImpl(db); 