import { Router } from "express";
import { asyncHandler } from "../utils/async-handler";
import { signerSchema } from "../validators/schemas";
import { db } from "../db";
import { signers } from "../schema";
import logger from "../utils/logger";

const router = Router();

router.get(
    "/",
    asyncHandler(async (req, res) => {
        logger.info("Fetching all signers");
        const signersList = await db.select().from(signers);
        logger.info("Fetched signers from database", { count: signersList.length });
        res.json(signersList);
    })
);

router.post(
    "/",
    asyncHandler(async (req, res) => {
        logger.info("Creating new signer", { body: req.body });
        
        const validated = signerSchema.parse(req.body);
        const [signer] = await db
            .insert(signers)
            .values(validated)
            .returning();

        logger.info("Signer created successfully", { signerId: signer.id });
        res.status(201).json(signer);
    })
);

export default router;