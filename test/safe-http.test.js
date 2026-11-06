import test from "node:test";
import assert from "node:assert/strict";
import {
    createPinnedLookup,
    createPinnedRequestOptions,
    createSafeHttpRequester,
    isPublicIpAddress,
    isValidMonitorUrl,
    parseMonitorUrl,
    SafeRequestError,
} from "../src/security/safe-http.js";

const publicIpv4 = "8.8.8.8";
const publicIpv6 = "2001:4860:4860::8888";

test("URL policy accepts HTTP(S) public hosts and rejects credentials, schemes, and nonstandard ports", () => {
    for (const url of [
        "http://example.com",
        "https://example.com/path?query=value",
    ]) {
        assert.equal(isValidMonitorUrl(url), true);
    }

    for (const url of [
        "not a URL",
        "file:///etc/passwd",
        "ftp://example.com",
        "http://user:password@example.com",
        "http://example.com:8080",
        "https://example.com:8443",
        "http://localhost",
        "http://service.localhost",
        "http://service.local",
        "http://127.0.0.1",
        "http://[::1]",
    ]) {
        assert.equal(isValidMonitorUrl(url), false, url);
    }

    assert.throws(
        () => parseMonitorUrl("https://user:password@example.com"),
        SafeRequestError
    );
    assert.throws(
        () => parseMonitorUrl("https://@example.com"),
        SafeRequestError
    );
});

test("IP classifier rejects private, loopback, link-local, metadata, reserved, and special ranges", () => {
    for (const address of [
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.1",
        "127.0.0.1",
        "169.254.1.1",
        "169.254.169.254",
        "0.0.0.0",
        "224.0.0.1",
        "255.255.255.255",
        "100.64.0.1",
        "192.0.2.1",
        "::",
        "::1",
        "fc00::1",
        "fe80::1",
        "ff02::1",
        "2001:db8::1",
        "2002::1",
        "2001::1",
        "2001:2::1",
        "2001:10::1",
        "2001:20::1",
        "2001:30::1",
        "5f00::1",
        "::ffff:127.0.0.1",
        "::ffff:169.254.169.254",
        "64:ff9b::808:808",
        "64:ff9b:1::808:808",
    ]) {
        assert.equal(isPublicIpAddress(address), false, address);
    }

    assert.equal(isPublicIpAddress(publicIpv4), true);
    assert.equal(isPublicIpAddress(publicIpv6), true);
    assert.equal(isPublicIpAddress("::ffff:8.8.8.8"), true);
});

test("DNS results are validated completely and selected addresses are pinned", async () => {
    const calls = [];
    const requester = createSafeHttpRequester({
        resolveHost: async (hostname) => {
            calls.push(hostname);
            return [{ address: publicIpv4, family: 4 }];
        },
        request: async (url, address) => {
            assert.equal(url.hostname, "monitor.example");
            assert.equal(address, publicIpv4);
            return { statusCode: 204 };
        },
    });

    const response = await requester("https://monitor.example/health");
    assert.equal(response.statusCode, 204);
    assert.deepEqual(calls, ["monitor.example"]);

    const ipv6Requester = createSafeHttpRequester({
        resolveHost: async () => [{ address: publicIpv6, family: 6 }],
        request: async (_url, address) => {
            assert.equal(address, publicIpv6);
            return { statusCode: 200 };
        },
    });
    assert.equal((await ipv6Requester("https://v6.example")).statusCode, 200);

    const mixedRequester = createSafeHttpRequester({
        resolveHost: async () => [
            { address: publicIpv4, family: 4 },
            { address: "10.0.0.7", family: 4 },
        ],
        request: async () => assert.fail("must reject before connecting"),
    });
    await assert.rejects(mixedRequester("https://mixed.example"), SafeRequestError);

    const failedDnsRequester = createSafeHttpRequester({
        resolveHost: async () => { throw new Error("private resolver detail"); },
        request: async () => assert.fail("must not connect after DNS failure"),
    });
    await assert.rejects(
        failedDnsRequester("https://missing.example"),
        /Unable to resolve monitor destination/
    );
});

test("DNS lookup failures are normalized without exposing resolver details", async () => {
    let requestCalled = false;
    const requester = createSafeHttpRequester({
        resolveHost: async () => {
            const error = new Error("getaddrinfo ENOTFOUND private-service.internal");
            error.code = "ENOTFOUND";
            throw error;
        },
        request: async () => {
            requestCalled = true;
            return { statusCode: 200 };
        },
    });

    await assert.rejects(
        requester("https://missing.example"),
        (error) => {
            assert.ok(error instanceof SafeRequestError);
            assert.equal(error.message, "Unable to resolve monitor destination");
            assert.equal(error.message.includes("private-service.internal"), false);
            return true;
        }
    );
    assert.equal(requestCalled, false);
});

test("connection failures from the pinned request reject without escaping as uncaught errors", async () => {
    const connectionError = new Error("connect ECONNREFUSED 8.8.8.8:443 via private-route");
    connectionError.code = "ECONNREFUSED";
    const requester = createSafeHttpRequester({
        resolveHost: async () => [{ address: publicIpv4, family: 4 }],
        request: async () => {
            throw connectionError;
        },
    });

    await assert.rejects(
        requester("https://refused.example"),
        (error) => error === connectionError
    );
});

test("DNS resolution timeout rejects and never invokes the HTTP request", async () => {
    let requestCalled = false;
    const keepEventLoopAlive = setTimeout(() => {}, 100);
    const requester = createSafeHttpRequester({
        resolveHost: () => new Promise(() => {}),
        request: async () => {
            requestCalled = true;
            return { statusCode: 200 };
        },
    });

    try {
        await assert.rejects(
            requester("https://slow-dns.example", { timeoutMs: 20 }),
            (error) => error.name === "TimeoutError" || error.name === "AbortError"
        );
        assert.equal(requestCalled, false);
    } finally {
        clearTimeout(keepEventLoopAlive);
    }
});

test("one timeout signal is reused across redirects and covers the entire request flow", async () => {
    const signals = [];
    let requestCount = 0;
    const keepEventLoopAlive = setTimeout(() => {}, 250);
    const requester = createSafeHttpRequester({
        resolveHost: async () => [{ address: publicIpv4, family: 4 }],
        request: async (_url, _address, signal) => {
            signals.push(signal);
            requestCount += 1;

            if (requestCount === 1) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                return { statusCode: 302, location: "/second-hop" };
            }

            return new Promise((resolve, reject) => {
                const onAbort = () => reject(signal.reason);
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                signal.addEventListener("abort", onAbort, { once: true });
                setTimeout(() => {
                    signal.removeEventListener("abort", onAbort);
                    resolve({ statusCode: 302, location: "/third-hop" });
                }, 100);
            });
        },
    });

    try {
        await assert.rejects(
            requester("https://redirect-timeout.example", { timeoutMs: 150 }),
            (error) => error.name === "TimeoutError" || error.name === "AbortError"
        );
        assert.equal(requestCount, 2);
        assert.equal(signals.length, 2);
        assert.strictEqual(signals[0], signals[1]);
        assert.equal(signals[0].aborted, true);
    } finally {
        clearTimeout(keepEventLoopAlive);
    }
});

test("pinned lookup returns only the validated IP and rejects other hostname lookups", () => {
    const lookup = createPinnedLookup("monitor.example", publicIpv4);
    lookup("monitor.example", { all: true }, (error, records) => {
        assert.ifError(error);
        assert.deepEqual(records, [{ address: publicIpv4, family: 4 }]);
    });
    lookup("another.example", {}, (error) => {
        assert.ok(error instanceof SafeRequestError);
    });
    assert.throws(() => createPinnedLookup("monitor.example", "127.0.0.1"), SafeRequestError);
});

test("pinned HTTPS request options retain hostname, Host, and TLS verification defaults", () => {
    const options = createPinnedRequestOptions(
        new URL("https://monitor.example:443/health?full=1"),
        publicIpv4,
        new AbortController().signal
    );

    assert.equal(options.hostname, "monitor.example");
    assert.equal(options.servername, "monitor.example");
    assert.equal(options.headers.Host, "monitor.example");
    assert.equal(options.rejectUnauthorized, true);

    let result;
    options.lookup(options.hostname, {}, (_error, address, family) => {
        result = { address, family };
    });
    assert.deepEqual(result, { address: publicIpv4, family: 4 });
    assert.equal(options.path, "/health?full=1");
});

test("redirects are revalidated and relative redirects are resolved safely", async () => {
    const requests = [];
    const resolutions = [];
    const requester = createSafeHttpRequester({
        resolveHost: async (hostname) => {
            resolutions.push(hostname);
            return [{ address: publicIpv4, family: 4 }];
        },
        request: async (url, address) => {
            requests.push({ href: url.href, address });
            return requests.length === 1
                ? { statusCode: 302, location: "/next" }
                : { statusCode: 200 };
        },
    });

    assert.equal((await requester("https://redirect.example/start")).statusCode, 200);
    assert.deepEqual(resolutions, ["redirect.example", "redirect.example"]);
    assert.deepEqual(requests.map(({ href }) => href), [
        "https://redirect.example/start",
        "https://redirect.example/next",
    ]);

    const privateRedirect = createSafeHttpRequester({
        resolveHost: async (hostname) => [{
            address: hostname === "redirect.example" ? publicIpv4 : "169.254.169.254",
            family: 4,
        }],
        request: async () => ({ statusCode: 302, location: "http://metadata.example/" }),
    });
    await assert.rejects(privateRedirect("https://redirect.example"), SafeRequestError);

    const literalRedirect = createSafeHttpRequester({
        resolveHost: async () => [{ address: publicIpv4, family: 4 }],
        request: async () => ({ statusCode: 302, location: "http://127.0.0.1/" }),
    });
    await assert.rejects(literalRedirect("https://redirect.example"), SafeRequestError);

    let resolutionCount = 0;
    let rebindingRequestCount = 0;
    const rebindingRequester = createSafeHttpRequester({
        resolveHost: async () => {
            resolutionCount += 1;
            return [{
                address: resolutionCount === 1 ? publicIpv4 : "10.0.0.8",
                family: 4,
            }];
        },
        request: async () => {
            rebindingRequestCount += 1;
            return { statusCode: 302, location: "/second-hop" };
        },
    });
    await assert.rejects(rebindingRequester("https://rebind.example/start"), SafeRequestError);
    assert.equal(resolutionCount, 2);
    assert.equal(rebindingRequestCount, 1);
});

test("redirect loops and redirect-limit overflow are rejected", async () => {
    const loopRequester = createSafeHttpRequester({
        resolveHost: async () => [{ address: publicIpv4, family: 4 }],
        request: async () => ({ statusCode: 302, location: "/same" }),
    });
    await assert.rejects(loopRequester("https://loop.example/same"), /redirect loop/);

    let requestCount = 0;
    const limitedRequester = createSafeHttpRequester({
        maxRedirects: 2,
        resolveHost: async () => [{ address: publicIpv4, family: 4 }],
        request: async () => {
            requestCount += 1;
            return { statusCode: 302, location: `/hop-${requestCount}` };
        },
    });
    await assert.rejects(limitedRequester("https://many.example/start"), /redirect limit/);
    assert.equal(requestCount, 3);
});