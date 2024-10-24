import { db } from '../db';
import { bills } from '../db/schema/bills';

export const BillsService = {
  async getAllBills() {
    return db.select().from(bills);
  },

  // Add more methods as needed
};
