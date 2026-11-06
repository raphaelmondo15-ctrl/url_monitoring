import { z } from "zod";

export const idSchema = z.coerce
    .number()
    .int()
    .positive()
    .max(2147483647);

export default idSchema;
