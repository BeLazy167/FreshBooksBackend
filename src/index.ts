// server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { Redis } from '@upstash/redis';
import { pgTable, text, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createSampleProviders, createSampleBills } from './utils/createSampleData';
import { providers, bills } from './schema';
// Initialize environment variables
dotenv.config();

// Types
export interface Provider {
  id: string;
  name: string;
  mobile: string;
  address: string;
}

export interface VegetableItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Bill {
  id: string;
  providerId: string;
  providerName: string;
  items: VegetableItem[];
  total: number; // Changed from string to number
  date: Date; 
  signer?: string;
  createdAt: Date;
}

export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

// Database setup
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Schema

// Validation schema
const insertBillSchema = createInsertSchema(bills, {
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number(),
    price: z.number()
  })),
  total: z.number() // Ensure total is validated as a number
});

const insertProviderSchema = createInsertSchema(providers);

// Redis setup
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

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

// Bill service
const billService = {
  async getAll(): Promise<ServiceResponse<Bill[]>> {
    try {
      const cached = await cache.get<Bill[]>('bills:all');
      if (cached) return { data: cached, error: null };

      const data = await db.select().from(bills);
      await cache.set('bills:all', data);
      return { data: data as any, error: null };
    } catch (error) {
      console.error('Error getting bills:', error);
      return { data: null, error: 'Failed to fetch bills' };
    }
  },

  async getById(id: string): Promise<ServiceResponse<Bill>> {
    try {
      const cached = await cache.get<Bill>(`bill:${id}`);
      if (cached) return { data: cached, error: null };

      const [bill] = await db.select().from(bills).where(eq(bills.id, id));
      if (bill) {
        await cache.set(`bill:${id}`, bill);
        return { data: bill as any, error: null };
      }
      return { data: null, error: 'Bill not found' };
    } catch (error) {
      console.error('Error getting bill:', error);
      return { data: null, error: 'Failed to fetch bill' };
    }
  },

  async create(data: Omit<typeof insertBillSchema._type, 'id' | 'date' | 'createdAt'>): Promise<ServiceResponse<Bill>> {
    try {
      const [bill] = await db.insert(bills).values(data).returning();
      await cache.del('bills:all');
      return { data: bill as any, error: null };
    } catch (error) {
      console.error('Error creating bill:', error);
      return { data: null, error: 'Failed to create bill' };
    }
  }
};
const providerService = {
  async getAll(): Promise<ServiceResponse<Provider[]>> {
    const data = await db.select().from(providers);
    return { data: data as any, error: null };
  },
  async create(data: Omit<typeof insertProviderSchema._type, 'id'>): Promise<ServiceResponse<Provider>> {
    const [provider] = await db.insert(providers).values(data).returning();
    return { data: provider as any, error: null };
  }
};

// Add this before starting the server
const initializeSampleData = async () => {
  const existingProviders = await providerService.getAll();
  if (existingProviders.data && existingProviders.data.length === 0) {
    const sampleProviders = createSampleProviders(5);
    for (const provider of sampleProviders) {
      await providerService.create(provider);
    }
    console.log('Sample providers created');
  }

  const existingBills = await billService.getAll();
  if (existingBills.data && existingBills.data.length === 0) {
    const providers = await providerService.getAll();
    if (providers.data) {
      const sampleBills = createSampleBills(100, providers.data);
      for (const bill of sampleBills) {
        await billService.create(bill);
      }
      console.log('Sample bills created');
    }
  }
};

// Express app setup
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Error handler type
type RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

// Async handler wrapper
const asyncHandler = (fn: RequestHandler) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

// Routes
app.get('/api/bills', asyncHandler(async (req, res) => {
  const result = await billService.getAll();
  if (result.error) {
    res.status(500).json({ error: result.error });
  } else {
    res.json(result.data);
  }
  return undefined;
}));

app.get('/api/bills/:id', asyncHandler(async (req, res) => {
  const result = await billService.getById(req.params.id);
  if (result.error) {
    res.status(404).json({ error: result.error });
  } else {
    res.json(result.data);
  }
}));

app.post('/api/bills', asyncHandler(async (req, res): Promise<void> => {
  try {
    const validated = insertBillSchema.parse(req.body);
    const result = await billService.create(validated);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result.data);
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: 'Invalid bill data', details: error.message });
    } else {
      throw error;
    }
  }
}));

app.get('/api/providers', asyncHandler(async (req, res) => {
  const result = await providerService.getAll();
  res.json(result.data);
}));

app.post('/api/providers', asyncHandler(async (req, res) => {
  const result = await providerService.create(req.body);
  res.status(201).json(result.data);
}));

// Error handler middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const server = app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  await initializeSampleData();
});

// Graceful shutdown
const shutdown = () => {
  server.close(() => {
    console.log('Server shutting down...');
    process.exit(0);
  });
};

// Error handling
process.on('unhandledRejection', (error: Error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  shutdown();
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
