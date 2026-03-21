import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getFileUrl, uploadFile } from "@/lib/storage";
import { getDirectDbPool } from "@/lib/direct-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB 每块，适配 Vercel 请求体限制
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const SESSION_TTL_MS = 60 * 60 * 1000;

let chunkSchemaReady: Promise<void> | null = null;

async function ensureChunkUploadSchema(): Promise<void> {
  if (!chunkSchemaReady) {
    chunkSchemaReady = (async () => {
      const pool = getDirectDbPool();
      await pool.query(`
        create table if not exists upload_chunk_sessions (
          id text primary key,
          file_name text not null,
          file_size bigint not null,
          mime_type text not null,
          total_chunks integer not null,
          title text not null,
          description text not null default '',
          category_id text not null,
          semester text not null default '',
          course text not null default '',
          tags jsonb not null default '[]'::jsonb,
          user_id text not null,
          is_admin_or_volunteer boolean not null default false,
          created_at timestamptz not null default now()
        );
      `);
      await pool.query(`
        create table if not exists upload_chunk_parts (
          session_id text not null references upload_chunk_sessions(id) on delete cascade,
          chunk_index integer not null,
          chunk_data bytea not null,
          created_at timestamptz not null default now(),
          primary key (session_id, chunk_index)
        );
      `);
      await pool.query(`create index if not exists upload_chunk_sessions_created_at_idx on upload_chunk_sessions(created_at);`);
      await pool.query(`create index if not exists upload_chunk_parts_session_idx on upload_chunk_parts(session_id);`);
    })();
  }
  return chunkSchemaReady;
}

async function cleanupExpiredSessions(): Promise<void> {
  try {
    const pool = getDirectDbPool();
    await pool.query(`delete from upload_chunk_sessions where created_at < now() - interval '1 hour'`);
  } catch (error) {
    console.warn("[ChunkedUpload] cleanup failed:", error);
  }
}

async function authorize(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return { error: NextResponse.json({ error: "未授权" }, { status: 401 }) };
  }

  const client = getSupabaseClient(token);
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError) {
    return { error: NextResponse.json({ error: `认证失败: ${authError.message}` }, { status: 401 }) };
  }
  if (!user) {
    return { error: NextResponse.json({ error: "用户不存在或令牌已过期，请重新登录" }, { status: 401 }) };
  }

  const { data: userProfile } = await client
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return {
    client,
    user,
    userRole: userProfile?.role || "guest",
  };
}

async function initChunkedUpload(request: NextRequest) {
  await ensureChunkUploadSchema();
  await cleanupExpiredSessions();

  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { user, userRole } = auth;
  const isAdminOrVolunteer = userRole === "admin" || userRole === "volunteer";

  const body = await request.json();
  const { fileName, fileSize, mimeType, title, description, categoryId, semester, course, tags } = body;

  if (!fileName || !fileSize || !title || !categoryId) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` }, { status: 400 });
  }

  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  const sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const pool = getDirectDbPool();

  await pool.query(
    `insert into upload_chunk_sessions (
      id, file_name, file_size, mime_type, total_chunks, title, description, category_id, semester, course, tags, user_id, is_admin_or_volunteer, created_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,now())`,
    [
      sessionId,
      fileName,
      fileSize,
      mimeType || "application/octet-stream",
      totalChunks,
      title,
      description || "",
      categoryId,
      semester || "",
      course || "",
      JSON.stringify(tags || []),
      user.id,
      isAdminOrVolunteer,
    ]
  );

  return NextResponse.json({
    sessionId,
    chunkSize: CHUNK_SIZE,
    totalChunks,
  });
}

async function uploadChunk(request: NextRequest) {
  await ensureChunkUploadSchema();

  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const formData = await request.formData();
  const sessionId = formData.get("sessionId") as string;
  const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
  const chunk = formData.get("chunk") as File;

  if (!sessionId || Number.isNaN(chunkIndex) || !chunk) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const pool = getDirectDbPool();
  const { rows: sessionRows } = await pool.query(
    `select id, user_id, total_chunks from upload_chunk_sessions where id = $1 and user_id = $2 limit 1`,
    [sessionId, user.id]
  );

  const session = sessionRows[0];
  if (!session) {
    return NextResponse.json({ error: "上传会话不存在或已过期" }, { status: 404 });
  }

  const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
  await pool.query(
    `insert into upload_chunk_parts (session_id, chunk_index, chunk_data)
     values ($1, $2, $3)
     on conflict (session_id, chunk_index) do update set chunk_data = excluded.chunk_data, created_at = now()`,
    [sessionId, chunkIndex, chunkBuffer]
  );

  const { rows: countRows } = await pool.query(
    `select count(*)::int as count from upload_chunk_parts where session_id = $1`,
    [sessionId]
  );

  return NextResponse.json({
    success: true,
    chunkIndex,
    uploadedChunks: Number(countRows[0]?.count || 0),
    totalChunks: Number(session.total_chunks || 0),
  });
}

async function completeChunkedUpload(request: NextRequest) {
  await ensureChunkUploadSchema();

  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const body = await request.json();
  const { sessionId } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "缺少会话ID" }, { status: 400 });
  }

  const pool = getDirectDbPool();
  const { rows: sessionRows } = await pool.query(
    `select * from upload_chunk_sessions where id = $1 and user_id = $2 limit 1`,
    [sessionId, user.id]
  );
  const session = sessionRows[0];
  if (!session) {
    return NextResponse.json({ error: "上传会话不存在或已过期" }, { status: 404 });
  }

  const { rows: partRows } = await pool.query(
    `select chunk_index, chunk_data from upload_chunk_parts where session_id = $1 order by chunk_index asc`,
    [sessionId]
  );

  const totalChunks = Number(session.total_chunks || 0);
  if (partRows.length !== totalChunks) {
    return NextResponse.json({
      error: `分块不完整，已上传 ${partRows.length}/${totalChunks}`,
    }, { status: 400 });
  }

  try {
    const buffers = partRows.map((part) => Buffer.isBuffer(part.chunk_data) ? part.chunk_data : Buffer.from(part.chunk_data));
    const completeBuffer = Buffer.concat(buffers);
    console.log(`合并完成: ${session.file_name}, 大小: ${(completeBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    const fileKey = await uploadFile(completeBuffer, session.file_name, session.mime_type);

    const isImage = String(session.mime_type || "").startsWith("image/");
    let previewUrl: string | null = null;
    if (isImage) {
      previewUrl = await getFileUrl(fileKey, 30 * 24 * 3600);
    }

    const client = auth.client;
    const { data, error } = await client
      .from("files")
      .insert({
        title: session.title,
        description: session.description,
        file_name: session.file_name,
        file_key: fileKey,
        file_size: completeBuffer.length,
        file_type: session.file_name.split(".").pop() || "unknown",
        mime_type: session.mime_type,
        category_id: session.category_id,
        uploader_id: user.id,
        semester: session.semester,
        course: session.course,
        tags: session.tags,
        preview_url: previewUrl,
        is_active: false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const { data: category } = await client
      .from("categories")
      .select("name")
      .eq("id", session.category_id)
      .single();

    await Promise.all([
      pool.query(`delete from upload_chunk_parts where session_id = $1`, [sessionId]),
      pool.query(`delete from upload_chunk_sessions where id = $1`, [sessionId]),
    ]);

    return NextResponse.json({
      success: true,
      file: { ...data, categories: category },
      needsReview: true,
    });
  } catch (error) {
    console.error("完成上传失败:", error);
    return NextResponse.json({
      error: `上传失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const action = request.headers.get("x-upload-action");

  switch (action) {
    case "init":
      return initChunkedUpload(request);
    case "chunk":
      return uploadChunk(request);
    case "complete":
      return completeChunkedUpload(request);
    default:
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
  }
}
