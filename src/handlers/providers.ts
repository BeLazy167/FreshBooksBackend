import { Request, Response } from 'express';
import { ProvidersService } from '../services/providers';

export const getProviders = async (req: Request, res: Response) => {
  const providers = await ProvidersService.getAllProviders();
  res.json(providers);
};

// Add more handler functions as needed
