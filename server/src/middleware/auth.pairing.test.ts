import { describe, expect, test } from "bun:test";
import {
  canAccessDevice,
  isDeviceClaimed,
  isDeviceConfirmed,
  pairingStatus,
} from "./auth";

describe("pairingStatus helpers", () => {
  test("unpaired when no claim fields", () => {
    const device = {
      claimedAt: null,
      ownerTokenHash: null,
      pairedUserId: null,
      confirmedAt: null,
    };
    expect(isDeviceClaimed(device)).toBe(false);
    expect(pairingStatus(device)).toBe("unpaired");
  });

  test("pending when claimed but not confirmed", () => {
    const device = {
      claimedAt: new Date(),
      ownerTokenHash: "hash",
      pairedUserId: null,
      confirmedAt: null,
    };
    expect(isDeviceClaimed(device)).toBe(true);
    expect(isDeviceConfirmed(device)).toBe(false);
    expect(pairingStatus(device)).toBe("pending");
  });

  test("confirmed when confirmedAt set", () => {
    const device = {
      claimedAt: new Date(),
      ownerTokenHash: "hash",
      pairedUserId: null,
      confirmedAt: new Date(),
    };
    expect(isDeviceConfirmed(device)).toBe(true);
    expect(pairingStatus(device)).toBe("confirmed");
  });
});

describe("canAccessDevice", () => {
  const device = { id: "dev-1", pairedUserId: "user-1" as string | null };

  test("device and owner match by sub", () => {
    expect(canAccessDevice({ typ: "device", sub: "dev-1" }, device)).toBe(true);
    expect(canAccessDevice({ typ: "owner", sub: "dev-1" }, device)).toBe(true);
    expect(canAccessDevice({ typ: "device", sub: "other" }, device)).toBe(false);
  });

  test("user matches pairedUserId", () => {
    expect(
      canAccessDevice(
        { typ: "user", sub: "user-1", email: "a@b.c" },
        device,
      ),
    ).toBe(true);
    expect(
      canAccessDevice(
        { typ: "user", sub: "user-2", email: "a@b.c" },
        device,
      ),
    ).toBe(false);
  });
});
