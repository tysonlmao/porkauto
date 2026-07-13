import { afterEach, describe, expect, test } from "bun:test";
import { resolveJwtSecret } from "../lib/auth";

const originalSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe("resolveJwtSecret", () => {
  test("throws when unset", () => {
    delete process.env.JWT_SECRET;
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET is required/);
  });

  test("throws on placeholder in production", () => {
    process.env.JWT_SECRET = "dev-change-me-to-a-long-random-string";
    process.env.NODE_ENV = "production";
    expect(() => resolveJwtSecret()).toThrow(/insecure/);
  });

  test("allows placeholder in development", () => {
    process.env.JWT_SECRET = "dev-change-me-to-a-long-random-string";
    process.env.NODE_ENV = "development";
    expect(resolveJwtSecret()).toBe("dev-change-me-to-a-long-random-string");
  });

  test("returns custom secret", () => {
    process.env.JWT_SECRET = "local-test-secret-at-least-32-chars!!";
    process.env.NODE_ENV = "production";
    expect(resolveJwtSecret()).toBe("local-test-secret-at-least-32-chars!!");
  });
});
