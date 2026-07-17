import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mode = process.env.MODE || process.env.VITE_MODE || "production";
const envFiles = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const rawValue = line.slice(index + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}

const fileEnv = envFiles.reduce((current, file) => ({
  ...current,
  ...parseEnvFile(path.join(root, file))
}), {});

const env = {
  ...fileEnv,
  ...process.env
};

const requiredKeys = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_PAYSTACK_PUBLIC_KEY",
  "VITE_SITE_URL"
];

const issues = [];

for (const key of requiredKeys) {
  const value = String(env[key] || "").trim();
  if (!value) issues.push(`${key} is missing.`);
  if (/replace_me|your-|example\.com/i.test(value)) issues.push(`${key} still contains a placeholder value.`);
}

if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL !== "https://auzbmfwdxprtvjsvcxcj.supabase.co") {
  issues.push("VITE_SUPABASE_URL must target https://auzbmfwdxprtvjsvcxcj.supabase.co.");
}

if (env.VITE_SITE_URL && env.VITE_SITE_URL !== "https://zentelinsight.com.ng") {
  issues.push("VITE_SITE_URL must be https://zentelinsight.com.ng for production builds.");
}

if (env.VITE_PAYSTACK_PUBLIC_KEY && !/^pk_(test|live)_/.test(env.VITE_PAYSTACK_PUBLIC_KEY)) {
  issues.push("VITE_PAYSTACK_PUBLIC_KEY must start with pk_test_ or pk_live_.");
}

if (issues.length) {
  console.error("[payment-config] Public payment environment is incomplete:");
  for (const issue of issues) console.error(`- ${issue}`);
  console.error("[payment-config] Set these values in Vercel and redeploy. Do not add server secrets to the frontend.");
  process.exit(1);
}

console.info("[payment-config] Public payment environment validated.");
