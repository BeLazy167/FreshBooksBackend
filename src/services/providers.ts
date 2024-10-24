import { db } from '../db';
import { providers } from '../db/schema/providers';

export const ProvidersService = {
  async getAllProviders() {
    return db.select().from(providers);
  },

  // Add more methods as needed
};
