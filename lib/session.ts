import crypto from "crypto";

export const sessionCookieName = "kef_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

// 家庭内网部署允许退回内置密钥;公网部署请设置 AUTH_SECRET 环境变量。
const secret = process.env.AUTH_SECRET ?? "kids-english-family-session-secret";

function sign(userId: string) {
  return crypto.createHmac("sha256", secret).update(userId).digest("hex");
}

export function createSessionValue(userId: string) {
  return `${userId}.${sign(userId)}`;
}

export function parseSessionValue(value: string | undefined) {
  if (!value) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const userId = value.slice(0, separatorIndex);
  const signature = Buffer.from(value.slice(separatorIndex + 1));
  const expected = Buffer.from(sign(userId));

  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
    return null;
  }

  return userId;
}
