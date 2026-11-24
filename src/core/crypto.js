// TabHarbor 加密信封（M7/M8/Q6/Q2，2026-11-24 菜单/备份审计）
// 纯 WebCrypto：PBKDF2-SHA256 派生密钥 + AES-256-GCM 认证加密（带完整性校验，篡改即失败）。
// Q2 定稿：备份密码不落盘、不进备份文件、不写日志——信封只含 kdf 参数、salt/iv 与密文，
// 不含密码本身；每次加密/解密都由调用方临时提供密码，第一版不做会话暂存。
// 同时供 Node（BDD，crypto.subtle）与浏览器扩展页（安全上下文）使用，无网络、无任何出站 URL。

export const ENC_VERSION = 1;
export const KDF_NAME = "PBKDF2-SHA256";
export const ALG_NAME = "AES-256-GCM";
export const DEFAULT_ITERATIONS = 120000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("当前环境不支持 WebCrypto，无法加密备份");
  return c.subtle;
}

function randomBytes(n) {
  const c = globalThis.crypto;
  if (!c || !c.getRandomValues) throw new Error("当前环境不支持安全随机数");
  return c.getRandomValues(new Uint8Array(n));
}

/** Uint8Array → base64（逐字节，避免展开大数组导致栈溢出）。 */
export function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** base64 → Uint8Array。 */
export function b64ToBytes(str) {
  const s = atob(String(str));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations, usage) {
  const material = await subtle().importKey("raw", enc.encode(String(password)), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

/**
 * 加密明文字符串，返回信封对象（可 JSON.stringify 落盘/上传）。
 * opts.salt 可注入以便测试确定性；正常调用每次随机 salt + iv。
 */
export async function encryptText(plain, password, opts = {}) {
  if (password == null || String(password) === "") throw new Error("加密密码不能为空");
  const iterations = Number(opts.iterations) || DEFAULT_ITERATIONS;
  const salt = opts.salt ? b64ToBytes(opts.salt) : randomBytes(16);
  const iv = opts.iv ? b64ToBytes(opts.iv) : randomBytes(12);
  const key = await deriveKey(password, salt, iterations, "encrypt");
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    enc.encode(String(plain))
  );
  return {
    v: ENC_VERSION,
    alg: ALG_NAME,
    kdf: KDF_NAME,
    iter: iterations,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct)),
  };
}

/** 解密信封；密码错误或密文被篡改时 AES-GCM 认证失败并抛错。 */
export async function decryptText(envelope, password) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope))
    throw new Error("加密信封格式无效");
  if (envelope.v !== ENC_VERSION) throw new Error("加密信封版本不兼容");
  if (envelope.kdf !== KDF_NAME || envelope.alg !== ALG_NAME)
    throw new Error("不支持的加密算法或派生方式");
  if (password == null || String(password) === "") throw new Error("解密密码不能为空");
  const salt = b64ToBytes(envelope.salt);
  const iv = b64ToBytes(envelope.iv);
  const ct = b64ToBytes(envelope.ct);
  const key = await deriveKey(
    password,
    salt,
    Number(envelope.iter) || DEFAULT_ITERATIONS,
    "decrypt"
  );
  const plain = await subtle().decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, ct);
  return dec.decode(plain);
}

/** 判断对象是否为合法加密信封（结构层，不做解密）。 */
export function isEnvelope(obj) {
  return !!(
    obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    obj.v === ENC_VERSION &&
    obj.kdf === KDF_NAME &&
    obj.alg === ALG_NAME &&
    typeof obj.salt === "string" &&
    typeof obj.iv === "string" &&
    typeof obj.ct === "string"
  );
}
