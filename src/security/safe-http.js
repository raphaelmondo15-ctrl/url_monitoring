import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;

export class SafeRequestError extends Error {
    constructor(message) {
        super(message);
        this.name = "SafeRequestError";
    }
}

function normalizedHostname(hostname) {
    return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function isPublicIpAddress(address) {
    try {
        const parsed = ipaddr.process(address);
        if (parsed.range() !== "unicast") {
            return false;
        }

        return parsed.kind() !== "ipv6"
            || parsed.match([ipaddr.IPv6.parse("2000::"), 3]);
    } catch {
        return false;
    }
}

export function parseMonitorUrl(value) {
    let url;

    try {
        url = new URL(value);
    } catch {
        throw new SafeRequestError("Invalid monitor URL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new SafeRequestError("Only HTTP and HTTPS monitor URLs are allowed");
    }

    const authority = value.match(/^[A-Za-z][A-Za-z\d+.-]*:\/\/([^/?#]*)/)?.[1] ?? "";
    if (url.username || url.password || authority.includes("@")) {
        throw new SafeRequestError("Monitor URLs must not contain credentials");
    }

    const standardPort = url.protocol === "http:" ? "80" : "443";
    if (url.port && url.port !== standardPort) {
        throw new SafeRequestError("Only standard HTTP and HTTPS ports are allowed");
    }

    const hostname = normalizedHostname(url.hostname);
    if (
        hostname === "localhost"
        || hostname.endsWith(".localhost")
        || hostname.endsWith(".local")
    ) {
        throw new SafeRequestError("Monitor destination is not publicly routable");
    }

    const family = net.isIP(hostname);
    if (family && !isPublicIpAddress(hostname)) {
        throw new SafeRequestError("Monitor destination is not publicly routable");
    }

    return url;
}

export function isValidMonitorUrl(value) {
    try {
        parseMonitorUrl(value);
        return true;
    } catch {
        return false;
    }
}

export function createPinnedLookup(expectedHostname, address) {
    const hostname = normalizedHostname(expectedHostname);
    const family = net.isIP(address);

    if (!family || !isPublicIpAddress(address)) {
        throw new SafeRequestError("Monitor destination is not publicly routable");
    }

    return (requestedHostname, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        if (normalizedHostname(requestedHostname) !== hostname) {
            callback(new SafeRequestError("Unexpected hostname lookup"));
            return;
        }

        if (options?.family && options.family !== family) {
            callback(new SafeRequestError("Pinned address family mismatch"));
            return;
        }

        if (options?.all) {
            callback(null, [{ address, family }]);
            return;
        }

        callback(null, address, family);
    };
}

export function createPinnedRequestOptions(url, address, signal) {
    const hostname = normalizedHostname(url.hostname);
    const options = {
        hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        lookup: createPinnedLookup(hostname, address),
        signal,
        headers: {
            Host: url.host,
        },
    };

    if (url.protocol === "https:" && !net.isIP(hostname)) {
        options.servername = hostname;
    }

    if (url.protocol === "https:") {
        options.rejectUnauthorized = true;
    }

    return options;
}

function requestWithPinnedAddress(url, address, signal) {
    return new Promise((resolve, reject) => {
        const transport = url.protocol === "https:" ? https : http;
        const options = createPinnedRequestOptions(url, address, signal);

        const request = transport.request(options, (response) => {
            const result = {
                statusCode: response.statusCode ?? 0,
                location: response.headers.location,
            };

            response.destroy();
            resolve(result);
        });

        request.once("error", reject);
        request.end();
    });
}

async function resolveHostWithAbort(resolveHost, hostname, signal) {
    let removeAbortListener;
    const aborted = new Promise((_, reject) => {
        const onAbort = () => reject(signal.reason);
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    });

    try {
        return await Promise.race([resolveHost(hostname), aborted]);
    } finally {
        removeAbortListener?.();
    }
}

async function resolveValidatedAddress(url, resolveHost, signal) {
    const hostname = normalizedHostname(url.hostname);
    const family = net.isIP(hostname);

    if (family) {
        if (!isPublicIpAddress(hostname)) {
            throw new SafeRequestError("Monitor destination is not publicly routable");
        }
        return hostname;
    }

    let records;
    try {
        records = await resolveHostWithAbort(resolveHost, hostname, signal);
    } catch {
        if (signal.aborted) {
            throw signal.reason;
        }
        throw new SafeRequestError("Unable to resolve monitor destination");
    }

    if (!Array.isArray(records) || records.length === 0) {
        throw new SafeRequestError("Unable to resolve monitor destination");
    }

    const addresses = records.map((record) => record.address);
    if (addresses.some((address) => !isPublicIpAddress(address))) {
        throw new SafeRequestError("Monitor destination is not publicly routable");
    }

    return addresses[0];
}

export function createSafeHttpRequester({
    resolveHost = (hostname) => dnsLookup(hostname, {
        all: true,
        verbatim: true,
    }),
    request = requestWithPinnedAddress,
    maxRedirects = MAX_REDIRECTS,
} = {}) {
    return async function safeHttpRequest(value, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        const signal = AbortSignal.timeout(timeoutMs);
        let currentUrl = parseMonitorUrl(value);
        let redirectCount = 0;
        const visitedUrls = new Set();

        while (true) {
            if (visitedUrls.has(currentUrl.href)) {
                throw new SafeRequestError("Monitor redirect loop detected");
            }
            visitedUrls.add(currentUrl.href);

            const address = await resolveValidatedAddress(currentUrl, resolveHost, signal);
            const response = await request(currentUrl, address, signal);

            if (!REDIRECT_STATUSES.has(response.statusCode) || !response.location) {
                return response;
            }

            if (redirectCount >= maxRedirects) {
                throw new SafeRequestError("Monitor redirect limit exceeded");
            }

            let redirectUrl;
            try {
                redirectUrl = new URL(response.location, currentUrl);
            } catch {
                throw new SafeRequestError("Invalid monitor redirect URL");
            }

            currentUrl = parseMonitorUrl(redirectUrl.href);
            redirectCount += 1;
        }
    };
}

export const safeHttpRequest = createSafeHttpRequester();