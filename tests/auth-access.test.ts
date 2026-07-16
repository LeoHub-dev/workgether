import { describe, expect, it } from "vitest";
import { validateCredentials } from "@/lib/password";
import { canEditWithRole } from "@/lib/access";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("auth credentials validation", () => {
  it("rejects short username/password", () => {
    expect(validateCredentials("ab", "password")).toMatch(/Username/);
    expect(validateCredentials("alice", "123")).toMatch(/Password/);
  });

  it("accepts valid credentials", () => {
    expect(validateCredentials("alice", "password1")).toBeNull();
  });
});

describe("auth auto-register vs wrong password (hash helpers)", () => {
  it("hashes and verifies matching password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", hash)).toBe(true);
  });

  it("rejects wrong password for an existing hash (login error path)", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("share-role access helper", () => {
  it("owners and editors can edit; viewers cannot", () => {
    expect(canEditWithRole("owner")).toBe(true);
    expect(canEditWithRole("editor")).toBe(true);
    expect(canEditWithRole("viewer")).toBe(false);
    expect(canEditWithRole(null)).toBe(false);
  });
});
