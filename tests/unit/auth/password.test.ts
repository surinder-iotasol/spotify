import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hashPassword, comparePassword, BCRYPT_COST } from "../../../src/lib/auth";

describe("BCRYPT_COST constant", () => {
  it("equals 12 for cost factor", () => {
    expect(BCRYPT_COST).toBe(12);
  });
});

describe("hashPassword", () => {
  it("returns a bcrypt hash string for a valid password", async () => {
    const hash = await hashPassword("TestPassword123!");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^\$2[aby]\d?\$.{50,}$/);
  });

  it("produces different hashes for the same password (salted)", async () => {
    const hash1 = await hashPassword("SamePassword");
    const hash2 = await hashPassword("SamePassword");
    expect(hash1).not.toBe(hash2);
  });

  it("uses cost factor 12 (hash starts with $2b$12$ or $2a$12$)", async () => {
    const hash = await hashPassword("TestPassword");
    // bcrypt hashes with cost 12 contain $12$ in the prefix
    expect(hash).toMatch(/\$2[aby]\$12\$/);
  });

  it("handles long passwords", async () => {
    const longPassword = "a".repeat(1000);
    const hash = await hashPassword(longPassword);
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^\$2[aby]\d?\$.{50,}$/);
  });

  it("handles unicode passwords", async () => {
    const hash = await hashPassword("密码🔒пароль");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^\$2[aby]\d?\$.{50,}$/);
  });

  it("handles empty string password", async () => {
    const hash = await hashPassword("");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^\$2[aby]\d?\$.{50,}$/);
  });

  it("handles single character password", async () => {
    const hash = await hashPassword("x");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^\$2[aby]\d?\$.{50,}$/);
  });
});

describe("comparePassword", () => {
  it("returns true for matching password and hash", async () => {
    const password = "CorrectPassword123";
    const hash = await hashPassword(password);
    const result = await comparePassword(password, hash);
    expect(result).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const correctHash = await hashPassword("CorrectPassword123");
    const result = await comparePassword("WrongPassword", correctHash);
    expect(result).toBe(false);
  });

  it("returns false for a different password that shares a prefix", async () => {
    const correctHash = await hashPassword("TestPassword123");
    const result = await comparePassword("TestPassword", correctHash);
    expect(result).toBe(false);
  });

  it("handles empty string correctly", async () => {
    const hash = await hashPassword("");
    const match = await comparePassword("", hash);
    const noMatch = await comparePassword("notempty", hash);
    expect(match).toBe(true);
    expect(noMatch).toBe(false);
  });

  it("handles null-like edge cases gracefully", async () => {
    const hash = await hashPassword("test");
    // Empty string is false, but a different non-empty password is also false
    const result = await comparePassword("", hash);
    expect(result).toBe(false);
  });

  it("verifies multiple passwords against the same hash (only one matches)", async () => {
    const correctPassword = "UniquePassword456";
    const hash = await hashPassword(correctPassword);
    expect(await comparePassword("UniquePassword456", hash)).toBe(true);
    expect(await comparePassword("uniquepassword456", hash)).toBe(false);
    expect(await comparePassword("UniquePassword", hash)).toBe(false);
    expect(await comparePassword("", hash)).toBe(false);
  });
});

describe("hashPassword + comparePassword integration", () => {
  it("roundtrip: hash then verify works end-to-end", async () => {
    const passwords = ["StrongP@ss1", "Another$ecret789", "simple123"];
    for (const pw of passwords) {
      const hash = await hashPassword(pw);
      const verified = await comparePassword(pw, hash);
      expect(verified).toBe(true);
    }
  });

  it("different passwords never match the same hash", async () => {
    const hash = await hashPassword("PasswordOne123");
    expect(await comparePassword("PasswordOne123", hash)).toBe(true);
    expect(await comparePassword("PasswordTwo456", hash)).toBe(false);
    expect(await comparePassword("", hash)).toBe(false);
  });
});
