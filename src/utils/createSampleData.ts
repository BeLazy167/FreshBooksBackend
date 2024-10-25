import { v4 as uuidv4 } from 'uuid';

export type VegetableItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
}
export type Provider = {
  id: string;
  name: string;
  mobile: string;
  address: string;
}
export type Bill = {
  id: string;
  providerId: string;
  providerName: string;
  items: VegetableItem[];
  total: number;
  date: Date;
  signer: string;
  createdAt: Date;
}
const vegetables = [
  'Tomato', 'Cucumber', 'Carrot', 'Broccoli', 'Spinach', 'Potato', 'Onion', 'Lettuce',
  'Cabbage', 'Peas', 'Zucchini', 'Eggplant', 'Pepper', 'Garlic', 'Chili', 'Corn', 'Peach', 'Pear', 'Lemon', 'Lime', 'Grapefruit', 'Kiwi', 'Mango', 'Papaya', 'Passionfruit', 'Pineapple', 'Raspberry', 'Strawberry', 'Watermelon'
]
const signers = ['John', 'Jane', 'Jim', 'Jill']
const generateRandomVegetables = (count: number): VegetableItem[] => {

  return Array.from({ length: count }, () => ({
    id: uuidv4(),
    name: vegetables[Math.floor(Math.random() * vegetables.length)],
    quantity: Math.floor(Math.random() * 10) + 1,
    price: parseFloat((Math.random() * 5 + 0.5).toFixed(2))
  }));
};

export const createSampleProviders = (count: number): Provider[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: uuidv4(),
    name: `Provider ${index + 1}`,
    mobile: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
    address: `${Math.floor(Math.random() * 1000) + 1} Sample St, City, State, 12345`
  }));
};

export const createSampleBills = (count: number, providers: Provider[]): Bill[] => {
  return Array.from({ length: count }, () => {
    const provider = providers[Math.floor(Math.random() * providers.length)];
    const items = generateRandomVegetables(Math.floor(Math.random() * vegetables.length) + 1);
    const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0).toFixed(2);

    return {
      id: uuidv4(),
      providerId: provider.id,
      providerName: provider.name,
      items,
      total: parseFloat(total),
      date: new Date(),
      signer: signers[Math.floor(Math.random() * signers.length)],
      createdAt: new Date()
    };
  });
};
