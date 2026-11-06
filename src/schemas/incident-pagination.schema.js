import { z } from "zod";

const cursorPayloadSchema = z.object({
    started_at: z.string().regex(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/
    ).refine((value) => {
        const [year, month, day, hour, minute, second] = value
            .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\./)
            .slice(1)
            .map(Number);
        const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const daysInMonth = [
            31,
            leapYear ? 29 : 28,
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31,
        ];

        return year > 0
            && month >= 1
            && month <= 12
            && day >= 1
            && day <= daysInMonth[month - 1]
            && hour <= 23
            && minute <= 59
            && second <= 59;
    }, "Invalid cursor timestamp"),
    id: z.number().int().positive().max(2147483647),
}).strict();

function parseCursor(cursor) {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
        throw new Error("Invalid cursor encoding");
    }

    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) {
        throw new Error("Invalid cursor encoding");
    }

    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return cursorPayloadSchema.parse(JSON.parse(json));
}

export const incidentPaginationSchema = z.object({
    after: z.string().max(256).optional().transform((cursor, context) => {
        if (cursor === undefined) {
            return undefined;
        }

        try {
            return parseCursor(cursor);
        } catch {
            context.addIssue({
                code: "custom",
                message: "Invalid incident cursor",
            });
            return z.NEVER;
        }
    }),
    limit: z.coerce.number().int().min(1).max(100).default(10),
});

export function encodeIncidentCursor({ started_at, id }) {
    return Buffer.from(JSON.stringify({ started_at, id }), "utf8")
        .toString("base64url");
}