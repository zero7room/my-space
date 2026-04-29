import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptFeishuPayload, verifyFeishuSignature } from "../signature.js";

function pkcs7pad(buf: Buffer, blockSize: number) {
  const pad = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}

function feishuEncrypt(plainObj: unknown, encryptKey: string): string {
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  const data = pkcs7pad(Buffer.from(JSON.stringify(plainObj), "utf8"), 16);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, enc]).toString("base64");
}

describe("verifyFeishuSignature (no encrypt)", () => {
  it("accepts when verificationToken matches in body", () => {
    const body = JSON.stringify({ token: "v_t", type: "url_verification", challenge: "c1" });
    const got = verifyFeishuSignature({
      headers: {},
      rawBody: Buffer.from(body),
      verificationToken: "v_t",
      encryptKey: "",
    });
    expect(got.ok).toBe(true);
  });

  it("rejects on token mismatch", () => {
    const body = JSON.stringify({ token: "wrong", type: "url_verification" });
    const got = verifyFeishuSignature({
      headers: {},
      rawBody: Buffer.from(body),
      verificationToken: "v_t",
      encryptKey: "",
    });
    expect(got.ok).toBe(false);
  });
});

describe("decryptFeishuPayload (encrypt enabled)", () => {
  it("decrypts and validates token", () => {
    const encryptKey = "k".repeat(16);
    const inner = { token: "v_t", type: "event_callback", event: { foo: 1 } };
    const enc = feishuEncrypt(inner, encryptKey);
    const result = verifyFeishuSignature({
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ encrypt: enc })),
      verificationToken: "v_t",
      encryptKey,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.decoded as { type: string }).type).toBe("event_callback");
    }
  });

  it("rejects when token in decrypted payload mismatches", () => {
    const encryptKey = "k".repeat(16);
    const inner = { token: "wrong", type: "event_callback" };
    const enc = feishuEncrypt(inner, encryptKey);
    const result = verifyFeishuSignature({
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ encrypt: enc })),
      verificationToken: "v_t",
      encryptKey,
    });
    expect(result.ok).toBe(false);
  });

  it("decryptFeishuPayload exposed for tests", () => {
    const encryptKey = "k".repeat(16);
    const enc = feishuEncrypt({ token: "v_t", type: "x" }, encryptKey);
    const got = decryptFeishuPayload(enc, encryptKey);
    expect(got.token).toBe("v_t");
  });
});
