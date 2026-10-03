import { z } from "zod";

export const uptimeQuerySchema = z.object({
    window: z
        .string()
        .regex(/^\d+[smhd]$/, "Invalid window format")
        .default("24h")
});
