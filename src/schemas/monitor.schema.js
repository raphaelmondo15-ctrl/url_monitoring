import { z } from "zod";

export const createMonitorSchema = z.object({
    name: z.string().min(1).max(120),

    url: z
        .string()
        .refine(
            (value) => {
                try {
                    const parsedUrl = new URL(value);

                    return (
                        parsedUrl.protocol === "http:" ||
                        parsedUrl.protocol === "https:"
                    );
                } catch {
                    return false;
                }
            },
            {
                message: "URL must be a valid http or https URL",
            }
        ),

    interval_seconds: z.coerce
        .number()
        .int()
        .min(10)
        .max(3600)
        .default(60),

    expected_status: z.coerce
        .number()
        .int()
        .default(200),
});