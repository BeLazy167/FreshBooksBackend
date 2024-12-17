import { Request, Response, NextFunction } from "express";

// Service Interfaces
export interface CacheService {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, expireSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    getKeys(): Promise<string[]>;
}

export interface VegetableService {
    validateAndCreateVegetables(items: VegetableItem[]): Promise<VegetableItem[]>;
}

// Data Interfaces
export interface VegetableItem {
    id?: string;
    name: string;
    quantity: number;
    price: number;
    item_total?: number;
    isAvailable?: boolean;
    hasFixedPrice?: boolean;
    fixedPrice?: number | null;
}

export interface Bill {
    id: string;
    providerId: string;
    providerName: string;
    items: VegetableItem[];
    total: string;
    signer?: string;
    date: Date;
    createdAt: Date;
}

export interface Provider {
    id: string;
    name: string;
    mobile: string;
    address?: string;
}

export interface Signer {
    id: string;
    name: string;
}

// Utility Types
export type AsyncRequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<void>;

export type RateLimiterConfig = {
    windowMs: number;
    max: number;
};

// Response Types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

