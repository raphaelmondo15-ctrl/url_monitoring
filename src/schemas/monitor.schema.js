import { z } from "zod";
import { isValidMonitorUrl } from "../security/safe-http.js";

export const createMonitorSchema = z.object({
    name: z.string().min(1).max(120),

    url: z.string().refine(isValidMonitorUrl, {
        message: "URL must be a valid HTTP or HTTPS URL with no credentials or non-standard port",
    }),

    interval_seconds: z.coerce
        .number()
        .int()
        .min(10)
        .max(3600)
        .default(60),

    expected_status: z.coerce
        .number()
        .int()
        .min(100)
        .max(599)
        .default(200),
});

export const updateMonitorSchema = z.object({
    name: z.string().min(1).max(120).optional(),

    url: z.string().refine(isValidMonitorUrl, {
        message: "URL must be a valid HTTP or HTTPS URL with no credentials or non-standard port",
    }).optional(),

    interval_seconds: z.coerce
        .number()
        .int()
        .min(10)
        .max(3600)
        .optional(),

    expected_status: z.coerce
        .number()
        .int()
        .min(100)
        .max(599)
        .optional(),

    is_active: z.boolean().optional(),
});