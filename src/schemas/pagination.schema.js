import {z} from "zod";

export const paginationSchema = z.object({
    after: z.coerce.number().int().positive().max(2147483647).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(10),
});
