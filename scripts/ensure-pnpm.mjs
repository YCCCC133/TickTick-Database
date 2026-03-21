const userAgent = process.env.npm_config_user_agent || "";
const isPnpm = userAgent.includes("pnpm");
const isCi = process.env.CI === "true" || process.env.VERCEL === "1" || process.env.VERCEL === "true";

if (isCi || isPnpm) {
  process.exit(0);
}

console.error('Use "pnpm install" for installation in this project.');
console.error('If you do not have pnpm, install it via "npm i -g pnpm".');
process.exit(1);
