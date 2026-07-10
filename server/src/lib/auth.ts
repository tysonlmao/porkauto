import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();

function getSecret() {
  const secret = process.env.JWT_SECRET ?? "dev-change-me-to-a-long-random-string";
  return encoder.encode(secret);
}

export type UserTokenPayload = {
  sub: string;
  typ: "user";
  email: string;
};

export type DeviceTokenPayload = {
  sub: string;
  typ: "device";
};

export type TokenPayload = UserTokenPayload | DeviceTokenPayload;

export async function signUserToken(
  userId: string,
  email: string,
  expiresIn = "7d",
): Promise<string> {
  return new SignJWT({ typ: "user", email } satisfies Omit<UserTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function signDeviceToken(
  deviceId: string,
  expiresIn = "365d",
): Promise<string> {
  return new SignJWT({ typ: "device" } satisfies Omit<DeviceTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(deviceId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  const typ = payload.typ;
  const sub = payload.sub;

  if (!sub || (typ !== "user" && typ !== "device")) {
    throw new Error("Invalid token payload");
  }

  if (typ === "user") {
    if (typeof payload.email !== "string") {
      throw new Error("Invalid user token");
    }
    return { sub, typ: "user", email: payload.email };
  }

  return { sub, typ: "device" };
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function generatePairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return code;
}

export async function hashSecret(secret: string): Promise<string> {
  return Bun.password.hash(secret, { algorithm: "argon2id" });
}
