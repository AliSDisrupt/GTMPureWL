import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().default(4000),
    API_PORT: z.coerce.number().optional(),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    LEMLIST_API_KEY: z.string().optional()
});

const parsed = envSchema.parse(process.env);

export const env = {
    ...parsed,
    API_PORT: parsed.API_PORT ?? parsed.PORT,
};
