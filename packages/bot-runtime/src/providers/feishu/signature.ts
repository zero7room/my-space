import crypto from "node:crypto";
import type { VerifyInboundResult } from "../../channel/provider.js";

export function decryptFeishuPayload(encrypt: string, encryptKey: string): Record<string, unknown> {
  const buf = Buffer.from(encrypt, "base64");
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const iv = buf.subarray(0, 16);
  const data = buf.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  const padLen = decrypted[decrypted.length - 1] ?? 0;
  const unpadded = decrypted.subarray(0, decrypted.length - padLen).toString("utf8");
  return JSON.parse(unpadded) as Record<string, unknown>;
}

export type VerifyFeishuInput = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  verificationToken: string;
  encryptKey: string;
};

export function verifyFeishuSignature(input: VerifyFeishuInput): VerifyInboundResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(input.rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  if (typeof parsed.encrypt === "string") {
    if (!input.encryptKey) return { ok: false, reason: "encrypt-key-missing" };
    let decoded: Record<string, unknown>;
    try {
      decoded = decryptFeishuPayload(parsed.encrypt, input.encryptKey);
    } catch (err) {
      return {
        ok: false,
        reason: `decrypt-failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (decoded.token !== input.verificationToken) {
      return { ok: false, reason: "token-mismatch" };
    }
    return { ok: true, decoded };
  }

  if (parsed.token !== input.verificationToken) {
    return { ok: false, reason: "token-mismatch" };
  }
  return { ok: true, decoded: parsed };
}
