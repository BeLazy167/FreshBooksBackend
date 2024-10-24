import { Request, Response } from 'express';
import { BillsService } from '../services/bills';

export const getBills = async (req: Request, res: Response) => {
  const bills = await BillsService.getAllBills();
  res.json(bills);
};

// Add more handler functions as needed
