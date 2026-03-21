import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { ensureEnvLoaded } from "@/lib/env";

let pool: Pool | null = null;
let schemaReady = false;

interface QueryResponse<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number;
  status: number;
}

type Filter =
  | { kind: "eq"; column: string; value: any }
  | { kind: "neq"; column: string; value: any }
  | { kind: "gt"; column: string; value: any }
  | { kind: "gte"; column: string; value: any }
  | { kind: "lt"; column: string; value: any }
  | { kind: "lte"; column: string; value: any }
  | { kind: "is"; column: string; value: any }
  | { kind: "in"; column: string; values: any[] }
  | { kind: "or"; expression: string };

type OrderClause = { column: string; ascending: boolean };

interface AuthUserRow {
  id: string;
  email: string;
  created_at: string | null;
  updated_at: string | null;
  confirmed_at: string | null;
}

interface AuthSessionRow {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string | number;
  refresh_expires_at: string | number;
  revoked_at: string | null;
}

interface SessionPayload {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: "bearer";
}

function getConnectionString(): string {
  ensureEnvLoaded();

  const url = process.env.DATABASE_URL || process.env.PGDATABASE_URL;
  if (url) return url;

  const host = process.env.PGHOST;
  const port = process.env.PGPORT || "5432";
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;

  if (!host || !user || !password || !database) {
    throw new Error("DATABASE_URL is not configured");
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }
  return pool;
}

async function ensureAuthSchema(): Promise<void> {
  if (schemaReady) return;
  const db = getPool();
  await db.query(`
    create extension if not exists pgcrypto;
    create schema if not exists auth;
    create table if not exists auth.users (
      instance_id uuid null,
      id uuid primary key default gen_random_uuid(),
      aud varchar(255) not null default 'authenticated',
      role varchar(255) not null default 'authenticated',
      email varchar(255) unique not null,
      encrypted_password varchar(255) not null,
      email_confirmed_at timestamptz,
      invited_at timestamptz,
      confirmation_token varchar(255),
      confirmation_sent_at timestamptz,
      recovery_token varchar(255),
      recovery_sent_at timestamptz,
      email_change_token_new varchar(255),
      email_change varchar(255),
      email_change_sent_at timestamptz,
      last_sign_in_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      is_super_admin boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      phone text,
      phone_confirmed_at timestamptz,
      phone_change text,
      phone_change_token varchar(255),
      phone_change_sent_at timestamptz,
      confirmed_at timestamptz,
      email_change_token_current varchar(255),
      email_change_confirm_status smallint,
      banned_until timestamptz,
      reauthentication_token varchar(255),
      reauthentication_sent_at timestamptz,
      is_sso_user boolean not null default false,
      deleted_at timestamptz,
      is_anonymous boolean not null default false
    );
    create table if not exists public.app_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      access_token text not null unique,
      refresh_token text not null unique,
      expires_at bigint not null,
      refresh_expires_at bigint not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      revoked_at timestamptz
    );
    create index if not exists idx_auth_users_email on auth.users(email);
    create index if not exists idx_app_sessions_user_id on public.app_sessions(user_id);
  `);
  schemaReady = true;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function token(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

function sanitizeIdentifier(value: string): string {
  if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
    throw new Error(`Invalid identifier: ${value}`);
  }
  return value;
}

function parseOrClause(clause: string): { sql: string; params: any[] } {
  const parts = clause.split(".");
  if (parts.length < 3) {
    return { sql: "true", params: [] };
  }

  const column = sanitizeIdentifier(parts[0]);
  const op = parts[1];
  const value = parts.slice(2).join(".");

  switch (op) {
    case "ilike":
      return { sql: `${column} ilike $1`, params: [value.replace(/^%|%$/g, "")] };
    case "eq":
      return { sql: `${column} = $1`, params: [value] };
    case "neq":
      return { sql: `${column} <> $1`, params: [value] };
    case "is":
      return { sql: `${column} is ${value.toLowerCase() === "null" ? "null" : value}`, params: [] };
    default:
      return { sql: "true", params: [] };
  }
}

class QueryBuilder {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private selectColumns = "*";
  private returning = false;
  private returningColumns = "*";
  private filters: Filter[] = [];
  private orders: OrderClause[] = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private countExact = false;
  private singleMode: "single" | "maybeSingle" | null = null;
  private insertRows: Record<string, any>[] = [];
  private updateValues: Record<string, any> = {};

  constructor(private readonly table: string, private readonly db: Pool) {}

  select(columns = "*", options?: { count?: "exact" | null }) {
    if (this.operation !== "insert" && this.operation !== "update" && this.operation !== "delete") {
      this.operation = "select";
    }
    this.selectColumns = columns;
    this.returning = this.operation !== "select" ? true : this.returning;
    this.returningColumns = columns;
    if (options?.count === "exact") {
      this.countExact = true;
    }
    return this;
  }

  insert(values: Record<string, any> | Record<string, any>[]) {
    this.operation = "insert";
    this.insertRows = Array.isArray(values) ? values : [values];
    this.returning = true;
    return this;
  }

  update(values: Record<string, any>) {
    this.operation = "update";
    this.updateValues = values;
    this.returning = true;
    return this;
  }

  delete() {
    this.operation = "delete";
    this.returning = true;
    return this;
  }

  eq(column: string, value: any) { this.filters.push({ kind: "eq", column: sanitizeIdentifier(column), value }); return this; }
  neq(column: string, value: any) { this.filters.push({ kind: "neq", column: sanitizeIdentifier(column), value }); return this; }
  gt(column: string, value: any) { this.filters.push({ kind: "gt", column: sanitizeIdentifier(column), value }); return this; }
  gte(column: string, value: any) { this.filters.push({ kind: "gte", column: sanitizeIdentifier(column), value }); return this; }
  lt(column: string, value: any) { this.filters.push({ kind: "lt", column: sanitizeIdentifier(column), value }); return this; }
  lte(column: string, value: any) { this.filters.push({ kind: "lte", column: sanitizeIdentifier(column), value }); return this; }
  is(column: string, value: any) { this.filters.push({ kind: "is", column: sanitizeIdentifier(column), value }); return this; }
  in(column: string, values: any[]) { this.filters.push({ kind: "in", column: sanitizeIdentifier(column), values }); return this; }
  or(expression: string) { this.filters.push({ kind: "or", expression }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orders.push({ column: sanitizeIdentifier(column), ascending: options?.ascending !== false }); return this; }
  range(from: number, to: number) { this.offsetValue = from; this.limitValue = to - from + 1; return this; }
  limit(n: number) { this.limitValue = n; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybeSingle"; return this; }

  private compileWhere(startIndex = 1): { sql: string; params: any[]; nextIndex: number } {
    const clauses: string[] = [];
    const params: any[] = [];
    let index = startIndex;

    for (const filter of this.filters) {
      switch (filter.kind) {
        case "eq":
          if (filter.value === null) {
            clauses.push(`${filter.column} is null`);
          } else {
            clauses.push(`${filter.column} = $${index++}`);
            params.push(filter.value);
          }
          break;
        case "neq":
          clauses.push(`${filter.column} <> $${index++}`);
          params.push(filter.value);
          break;
        case "gt":
          clauses.push(`${filter.column} > $${index++}`);
          params.push(filter.value);
          break;
        case "gte":
          clauses.push(`${filter.column} >= $${index++}`);
          params.push(filter.value);
          break;
        case "lt":
          clauses.push(`${filter.column} < $${index++}`);
          params.push(filter.value);
          break;
        case "lte":
          clauses.push(`${filter.column} <= $${index++}`);
          params.push(filter.value);
          break;
        case "is":
          clauses.push(`${filter.column} is ${filter.value === null ? "null" : "not null"}`);
          break;
        case "in":
          clauses.push(`${filter.column} = any($${index++}::text[])`);
          params.push(filter.values);
          break;
        case "or": {
          const groups = filter.expression.split(",").map((item) => item.trim()).filter(Boolean);
          const orClauses: string[] = [];
          for (const group of groups) {
            const parsed = parseOrClause(group);
            if (parsed.sql === "true") continue;
            if (parsed.params.length > 0) {
              orClauses.push(parsed.sql.replace("$1", `$${index}`));
              params.push(parsed.params[0]);
              index += 1;
            } else {
              orClauses.push(parsed.sql);
            }
          }
          if (orClauses.length > 0) {
            clauses.push(`(${orClauses.join(" or ")})`);
          }
          break;
        }
      }
    }

    return {
      sql: clauses.length ? ` where ${clauses.join(" and ")}` : "",
      params,
      nextIndex: index,
    };
  }

  private compileOrder(): string {
    if (this.orders.length === 0) return "";
    return ` order by ${this.orders.map((order) => `${order.column} ${order.ascending ? "asc" : "desc"}`).join(", ")}`;
  }

  private compileReturning(): string {
    return this.returning ? ` returning ${this.returningColumns}` : "";
  }

  private async handleRows(rows: any[], count?: number): Promise<QueryResponse> {
    if (this.singleMode === "single") {
      if (rows.length !== 1) {
        return {
          data: null,
          error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
          status: 406,
          count,
        };
      }
      return { data: rows[0], error: null, status: 200, count };
    }

    if (this.singleMode === "maybeSingle") {
      if (rows.length === 0) {
        return { data: null, error: null, status: 200, count };
      }
      if (rows.length > 1) {
        return {
          data: null,
          error: { message: "JSON object requested, multiple rows returned", code: "PGRST116" },
          status: 406,
          count,
        };
      }
      return { data: rows[0], error: null, status: 200, count };
    }

    return { data: rows, error: null, status: 200, count };
  }

  private async execSelect(): Promise<QueryResponse> {
    const where = this.compileWhere(1);
    const order = this.compileOrder();
    const limit = this.limitValue != null ? ` limit ${this.limitValue}` : "";
    const offset = this.offsetValue != null ? ` offset ${this.offsetValue}` : "";
    const sql = `select ${this.selectColumns} from ${sanitizeIdentifier(this.table)}${where.sql}${order}${limit}${offset}`;
    const result = await this.db.query(sql, where.params);
    let count: number | undefined;

    if (this.countExact) {
      const countResult = await this.db.query(`select count(*)::int as count from ${sanitizeIdentifier(this.table)}${where.sql}`, where.params);
      count = countResult.rows[0]?.count ?? 0;
    }

    return this.handleRows(result.rows, count);
  }

  private async execInsert(): Promise<QueryResponse> {
    if (this.insertRows.length === 0) {
      return { data: null, error: { message: "No data to insert" }, status: 400 };
    }

    const keys = Array.from(new Set(this.insertRows.flatMap((row) => Object.keys(row))));
    const params: any[] = [];
    const tuples = this.insertRows.map((row) => {
      const placeholders = keys.map((key) => {
        params.push(row[key]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    const sql = `insert into ${sanitizeIdentifier(this.table)} (${keys.map(sanitizeIdentifier).join(", ")}) values ${tuples.join(", ")}${this.compileReturning()}`;
    const result = await this.db.query(sql, params);
    return this.handleRows(result.rows);
  }

  private async execUpdate(): Promise<QueryResponse> {
    const keys = Object.keys(this.updateValues);
    if (keys.length === 0) {
      return { data: null, error: { message: "No values to update" }, status: 400 };
    }

    const params: any[] = [];
    const sets = keys.map((key) => {
      params.push(this.updateValues[key]);
      return `${sanitizeIdentifier(key)} = $${params.length}`;
    });
    const where = this.compileWhere(params.length + 1);
    const sql = `update ${sanitizeIdentifier(this.table)} set ${sets.join(", ")}${where.sql}${this.compileReturning()}`;
    const result = await this.db.query(sql, [...params, ...where.params]);
    return this.handleRows(result.rows);
  }

  private async execDelete(): Promise<QueryResponse> {
    const where = this.compileWhere(1);
    const sql = `delete from ${sanitizeIdentifier(this.table)}${where.sql}${this.compileReturning()}`;
    const result = await this.db.query(sql, where.params);
    return this.handleRows(result.rows);
  }

  async execute(): Promise<QueryResponse> {
    await ensureAuthSchema();
    try {
      if (this.operation === "insert") return await this.execInsert();
      if (this.operation === "update") return await this.execUpdate();
      if (this.operation === "delete") return await this.execDelete();
      return await this.execSelect();
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Query failed" }, status: 500 };
    }
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

async function fetchAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  const db = getPool();
  const result = await db.query(
    `select id, email, created_at, updated_at, confirmed_at from auth.users where email = $1 and deleted_at is null limit 1`,
    [email]
  );
  return result.rows[0] || null;
}

async function fetchAuthUserById(id: string): Promise<AuthUserRow | null> {
  const db = getPool();
  const result = await db.query(
    `select id, email, created_at, updated_at, confirmed_at from auth.users where id = $1 and deleted_at is null limit 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createSession(userId: string): Promise<SessionPayload> {
  const db = getPool();
  const accessToken = token(32);
  const refreshToken = token(48);
  const expiresIn = 60 * 60 * 24;
  const refreshExpiresIn = 60 * 60 * 24 * 30;
  const expiresAt = nowSeconds() + expiresIn;
  const refreshExpiresAt = nowSeconds() + refreshExpiresIn;

  await db.query(
    `insert into public.app_sessions (user_id, access_token, refresh_token, expires_at, refresh_expires_at) values ($1, $2, $3, $4, $5)`,
    [userId, accessToken, refreshToken, expiresAt, refreshExpiresAt]
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    expires_in: expiresIn,
    token_type: "bearer",
  };
}

async function getSessionByAccessToken(accessToken: string): Promise<AuthSessionRow | null> {
  const db = getPool();
  const result = await db.query(
    `select * from public.app_sessions where access_token = $1 and revoked_at is null and expires_at > $2 limit 1`,
    [accessToken, nowSeconds()]
  );
  return result.rows[0] || null;
}

async function getSessionByRefreshToken(refreshToken: string): Promise<AuthSessionRow | null> {
  const db = getPool();
  const result = await db.query(
    `select * from public.app_sessions where refresh_token = $1 and revoked_at is null and refresh_expires_at > $2 limit 1`,
    [refreshToken, nowSeconds()]
  );
  return result.rows[0] || null;
}

function buildUserObject(user: AuthUserRow | null) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    updated_at: user.updated_at,
    confirmed_at: user.confirmed_at,
    user_metadata: {},
    app_metadata: { provider: "email" },
  };
}

async function getCurrentUser(tokenValue?: string) {
  if (!tokenValue) {
    return { user: null, error: { message: "Missing token" } };
  }

  const session = await getSessionByAccessToken(tokenValue);
  if (!session) {
    return { user: null, error: { message: "Invalid token" } };
  }

  const user = await fetchAuthUserById(session.user_id);
  if (!user) {
    return { user: null, error: { message: "User not found" } };
  }

  return { user: buildUserObject(user), error: null };
}

function createTencentClient() {
  return {
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        await ensureAuthSchema();
        const user = await fetchAuthUserByEmail(email);
        if (!user) {
          return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
        }

        const db = getPool();
        const hashResult = await db.query(`select encrypted_password from auth.users where id = $1 limit 1`, [user.id]);
        const hash = hashResult.rows[0]?.encrypted_password;
        if (!hash || !(await bcrypt.compare(password, hash))) {
          return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
        }

        const session = await createSession(user.id);
        await db.query(`update auth.users set last_sign_in_at = now(), updated_at = now() where id = $1`, [user.id]);

        return { data: { user: buildUserObject(user), session }, error: null };
      },

      async signUp({ email, password }: { email: string; password: string }) {
        await ensureAuthSchema();
        const existing = await fetchAuthUserByEmail(email);
        if (existing) {
          return { data: { user: null, session: null }, error: { message: "User already registered" } };
        }

        const db = getPool();
        const id = randomUUID();
        const hash = await bcrypt.hash(password, 10);
        await db.query(
          `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ($1, 'authenticated', 'authenticated', $2, $3, now(), $4::jsonb, $5::jsonb, now(), now())`,
          [id, email, hash, JSON.stringify({ provider: "email", providers: ["email"] }), JSON.stringify({})]
        );

        const user = await fetchAuthUserById(id);
        const session = await createSession(id);
        return { data: { user: buildUserObject(user), session }, error: null };
      },

      async refreshSession({ refresh_token }: { refresh_token: string }) {
        await ensureAuthSchema();
        const existing = await getSessionByRefreshToken(refresh_token);
        if (!existing) {
          return { data: { user: null, session: null }, error: { message: "Session expired" } };
        }

        const db = getPool();
        await db.query(`update public.app_sessions set revoked_at = now() where id = $1`, [existing.id]);
        const newSession = await createSession(existing.user_id);
        const user = await fetchAuthUserById(existing.user_id);
        return { data: { user: buildUserObject(user), session: newSession }, error: null };
      },

      async getUser(tokenValue: string) {
        await ensureAuthSchema();
        const result = await getCurrentUser(tokenValue);
        return {
          data: { user: result.user },
          error: result.error,
        };
      },

      admin: {
        async deleteUser(userId: string) {
          await ensureAuthSchema();
          const db = getPool();
          await db.query(`delete from public.app_sessions where user_id = $1`, [userId]);
          await db.query(`delete from auth.users where id = $1`, [userId]);
          return { data: { user: null }, error: null };
        },
      },
    },

    from(table: string) {
      return new QueryBuilder(table, getPool()) as any;
    },

    async rpc(name: string, params: Record<string, any>) {
      await ensureAuthSchema();
      const db = getPool();
      try {
        if (name === "adjust_user_points") {
          const { p_user_id, p_amount, p_type, p_description } = params;
          await db.query("begin");
          const current = await db.query(`select balance, total_earned, total_spent from user_points where user_id = $1 for update`, [p_user_id]);
          if (current.rowCount === 0) {
            await db.query(`insert into user_points (user_id, balance, total_earned, total_spent) values ($1, $2, $2, 0)`, [p_user_id, p_amount]);
          } else {
            const row = current.rows[0];
            const newBalance = Number(row.balance) + Number(p_amount);
            const newTotalEarned = Number(row.total_earned) + (Number(p_amount) > 0 ? Number(p_amount) : 0);
            const newTotalSpent = Number(row.total_spent) + (Number(p_amount) < 0 ? Math.abs(Number(p_amount)) : 0);
            await db.query(
              `update user_points set balance = $2, total_earned = $3, total_spent = $4, updated_at = now() where user_id = $1`,
              [p_user_id, newBalance, newTotalEarned, newTotalSpent]
            );
          }
          await db.query(`insert into point_transactions (user_id, amount, type, description) values ($1, $2, $3, $4)`, [p_user_id, p_amount, p_type, p_description]);
          await db.query("commit");
          return { data: null, error: null };
        }

        return { data: null, error: { message: `RPC ${name} not implemented` } };
      } catch (error) {
        await db.query("rollback");
        return { data: null, error: { message: error instanceof Error ? error.message : "RPC failed" } };
      }
    },
  };
}

function getSupabaseCredentials() {
  ensureEnvLoaded();
  const url = process.env.DATABASE_URL || process.env.PGDATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return { url };
}

function getSupabaseClient(_token?: string) {
  void getSupabaseCredentials();
  return createTencentClient() as any;
}

export { ensureAuthSchema, getPool as getDatabasePool, getSupabaseClient, getSupabaseCredentials };
