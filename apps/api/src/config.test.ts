import { describe, expect, it } from "vitest";
import { createApiRuntimeConfig } from "./config";
import { ConfigValidationError } from "./errors";

describe("api runtime config", () => {
  it("provides stable defaults for local development", () => {
    const config = createApiRuntimeConfig({}, "/tmp/gnucash-ng");

    expect(config).toEqual({
      authIdentities: [],
      bodyLimitBytes: 1048576,
      dataDirectory: "/tmp/gnucash-ng/data",
      host: "127.0.0.1",
      port: 4000,
      rateLimit: {
        importLimit: 10,
        mutationLimit: 30,
        readLimit: 120,
        windowMs: 60000,
      },
    });
  });

  it("accepts explicit host, port, and data directory overrides", () => {
    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_AUTH_TOKEN: "top-secret",
        GNUCASH_NG_API_HOST: "0.0.0.0",
        GNUCASH_NG_API_PORT: "4100",
        GNUCASH_NG_DATA_DIR: "var/workspaces",
        GNUCASH_NG_API_RATE_LIMIT_IMPORTS: "4",
        GNUCASH_NG_API_RATE_LIMIT_MUTATIONS: "12",
        GNUCASH_NG_API_RATE_LIMIT_READS: "75",
        GNUCASH_NG_API_RATE_LIMIT_WINDOW_MS: "30000",
      },
      "/tmp/gnucash-ng",
    );

    expect(config).toEqual({
      authIdentities: [{ actor: "api-user", role: "admin", token: "top-secret" }],
      bodyLimitBytes: 1048576,
      dataDirectory: "/tmp/gnucash-ng/var/workspaces",
      host: "0.0.0.0",
      port: 4100,
      rateLimit: {
        importLimit: 4,
        mutationLimit: 12,
        readLimit: 75,
        windowMs: 30000,
      },
    });
  });

  it("rejects non-loopback binding without an auth token", () => {
    expect(() =>
      createApiRuntimeConfig(
        {
          GNUCASH_NG_API_HOST: "0.0.0.0",
        },
        "/tmp/gnucash-ng",
      ),
    ).toThrow("Non-loopback API binding requires GNUCASH_NG_API_AUTH_TOKEN or GNUCASH_NG_API_AUTH_IDENTITIES.");
  });

  it("rejects invalid numeric configuration values", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          GNUCASH_NG_API_BODY_LIMIT_BYTES: "0",
        }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects malformed auth identity configuration", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          GNUCASH_NG_API_AUTH_IDENTITIES: '{"bad":true}',
        }),
    ).toThrow("GNUCASH_NG_API_AUTH_IDENTITIES must be an array.");
  });
});
