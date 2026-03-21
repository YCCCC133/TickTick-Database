import { Pool } from "pg";
import { ensureEnvLoaded } from "@/lib/env";

let pool: Pool | null = null;

function buildConnectionString(): string {
  ensureEnvLoaded();

  const url = process.env.DATABASE_URL || process.env.PGDATABASE_URL;
  if (url) {
    return url;
  }

  const host = process.env.PGHOST;
  const port = process.env.PGPORT || "5432";
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;

  if (!host || !user || !password || !database) {
    throw new Error("PostgreSQL connection is not configured");
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function getDirectDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: buildConnectionString(),
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }

  return pool;
}

export async function directQuery<T = unknown>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = getDirectDbPool();
  const result = await client.query(text, values);
  return result.rows as T[];
}
