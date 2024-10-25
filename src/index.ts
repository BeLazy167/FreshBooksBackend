import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { Redis } from '@upstash/redis';
import { eq } from 'drizzle-orm';
import { createSampleProviders, createSampleBills, Provider, Bill } from './utils/createSampleData';
import { bills, providers, vegetables, signers } from './schema';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Database setup
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Redis setup
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Schema validation
const vegetableItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number(),
  price: z.number()
});

const billSchema = createInsertSchema(bills).extend({
  items: z.array(vegetableItemSchema)
});

const providerSchema = createInsertSchema(providers);

// Cache service
const cache = {
  async get<T>(key: string): Promise<T | null> {
    return redis.get<T>(key);
  },
  async set(key: string, value: any, expireSeconds = 3600): Promise<void> {
    await redis.set(key, value, { ex: expireSeconds });
  },
  async del(key: string): Promise<void> {
    await redis.del(key);
  }
};

// Vegetable service
const vegetableService = {
  async validateAndCreateVegetables(items: z.infer<typeof vegetableItemSchema>[]) {
    const validatedItems: (z.infer<typeof vegetableItemSchema> | { id: string; name: string; isAvailable: boolean })[] = [];
    
    for (const item of items) {
      // Check if vegetable exists
      const [existingVegetable] = await db
        .select()
        .from(vegetables)
        .where(eq(vegetables.name, item.name));

      if (existingVegetable) {
        // Verify name matches
        if (existingVegetable.name !== item.name) {
          throw new Error(`Vegetable Name ${item.name} exists but with different id: ${existingVegetable.id}`);
        }
        validatedItems.push({
          id: existingVegetable.id,
          name: existingVegetable.name,
          isAvailable: existingVegetable.isAvailable ?? false
        });
      } else {
        // Create new vegetable with isAvailable=false
        const [newVegetable] = await db
          .insert(vegetables)
          .values({
            name: item.name,
            isAvailable: false
          })
          .returning();

        validatedItems.push({
          id: newVegetable.id,
          name: newVegetable.name,
          isAvailable: newVegetable.isAvailable ?? false
        });
        console.log(`Added new vegetable: ${item.name} with isAvailable=false`);
      }
    }
    
    return validatedItems;
  }
};

const initializeSampleData = async () => {
  const existingProviders = await db.select().from(providers);
  if (existingProviders.length === 0) {
    const sampleProviders = createSampleProviders(5);
    for (const provider of sampleProviders) {
      await db.insert(providers).values(provider);
    }
    console.log('Sample providers created');
  }

  const existingBills = await db.select().from(bills);
  if (existingBills.length === 0) {
    const providers2 = await db.select().from(providers);  
    if (providers2.length > 0) {
      const sampleBills = createSampleBills(100, providers2 as Provider[]);
      for (const bill of sampleBills) {
        // Validate vegetables before inserting sample bills
        const validatedItems = await vegetableService.validateAndCreateVegetables(bill.items);
        await db.insert(bills).values({ ...bill, items: validatedItems } as any);
      }
      console.log('Sample bills created');
    }
  }
};

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());

// Types for request handlers
type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

// Error handler wrapper
const asyncHandler = (fn: AsyncRequestHandler) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Bill routes
app.get('/api/bills', asyncHandler(async (req: Request, res: Response) => {
  const cached = await cache.get<any[]>('bills:all');
  if (cached) {
    res.json(cached);
    return;
  }

  const data = await db.select().from(bills);
  await cache.set('bills:all', data);
  res.json(data);
}));

app.get('/api/bills/:id', asyncHandler(async (req: Request, res: Response) => {
  const cached = await cache.get<any>(`bill:${req.params.id}`);
  if (cached) {
    res.json(cached);
    return;
  }

  const [bill] = await db.select().from(bills).where(eq(bills.id, req.params.id));
  if (!bill) {
    res.status(404).json({ error: 'Bill not found' });
    return;
  }

  await cache.set(`bill:${req.params.id}`, bill);
  res.json(bill);
}));

app.post('/api/bills', asyncHandler(async (req: Request, res: Response) => {
  try {
    const validated = billSchema.parse(req.body);
    
    // Validate and create vegetables if needed
    const validatedItems = await vegetableService.validateAndCreateVegetables(validated.items);
    
    // Insert bill with validated items
    const [bill] = await db
      .insert(bills)
      .values({ ...validated, items: validatedItems })
      .returning();
      
    await cache.del('bills:all');
    res.status(201).json(bill);
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
    } else {
      throw error;
    }
  }
}));

// Provider routes
app.get('/api/providers', asyncHandler(async (req: Request, res: Response) => {
  const providerList = await db.select().from(providers);
  res.json(providerList);
}));

app.post('/api/providers', asyncHandler(async (req: Request, res: Response) => {
  const validated = providerSchema.parse(req.body);
  const [provider] = await db.insert(providers).values(validated).returning();
  res.status(201).json(provider);
}));

// Vegetable routes
app.get('/api/vegetables', asyncHandler(async (req: Request, res: Response) => {
  const vegetableList = await db.select().from(vegetables);
  res.json(vegetableList);
}));

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  initializeSampleData();
  console.log(`Server running on port ${port}`)
});

export default app;
