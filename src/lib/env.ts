import fs from "fs";
import path from "path";
import dotenv from "dotenv";

let loaded = false;

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  dotenv.config({ path: filePath });
}

export function ensureEnvLoaded(): void {
  if (loaded) return;

  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));

  loaded = true;
}
