import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getFileUrl } from "@/lib/storage";

// 分块上传配置
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB 每块
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// 存储分块信息的临时表（使用内存缓存）
const uploadSessions = new Map<string, {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
  chunks: Buffer[];
  title: string;
  description: string;
  categoryId: string;
  semester: string;
  course: string;
  tags: string[];
  userId: string;
  createdAt: number;
  isAdminOrVolunteer: boolean; // 是否是管理员/志愿者（决定是否需要审核）
}>();

// 清理过期会话（超过1小时）
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of uploadSessions.entries()) {
    if (now - session.createdAt > 60 * 60 * 1000) {
      uploadSessions.delete(sessionId);
    }
  }
}, 60 * 1000);

/**
 * 初始化分块上传
 */
async function initChunkedUpload(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const client = getSupabaseClient(token);
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError) {
    console.log("Chunked upload auth error:", authError.message);
    return NextResponse.json({ error: `认证失败: ${authError.message}` }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "用户不存在或令牌已过期，请重新登录" }, { status: 401 });
  }

  // 获取用户角色
  const { data: userProfile } = await client
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  
  const userRole = userProfile?.role || "guest";
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

  uploadSessions.set(sessionId, {
    fileId: '',
    fileName,
    fileSize,
    mimeType,
    totalChunks,
    uploadedChunks: new Set<number>(),
    chunks: new Array(totalChunks),
    title,
    description: description || '',
    categoryId,
    semester: semester || '',
    course: course || '',
    tags: tags || [],
    userId: user.id,
    createdAt: Date.now(),
    isAdminOrVolunteer,
  });

  return NextResponse.json({
    sessionId,
    chunkSize: CHUNK_SIZE,
    totalChunks,
  });
}

/**
 * 上传单个分块
 */
async function uploadChunk(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const formData = await request.formData();
  const sessionId = formData.get("sessionId") as string;
  const chunkIndex = parseInt(formData.get("chunkIndex") as string);
  const chunk = formData.get("chunk") as File;

  if (!sessionId || isNaN(chunkIndex) || !chunk) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const session = uploadSessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: "上传会话不存在或已过期" }, { status: 404 });
  }

  // 存储分块
  const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
  session.chunks[chunkIndex] = chunkBuffer;
  session.uploadedChunks.add(chunkIndex);

  return NextResponse.json({
    success: true,
    chunkIndex,
    uploadedChunks: session.uploadedChunks.size,
    totalChunks: session.totalChunks,
  });
}

/**
 * 完成分块上传并合并文件
 */
async function completeChunkedUpload(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const client = getSupabaseClient(token);
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError) {
    console.log("Complete upload auth error:", authError.message);
    return NextResponse.json({ error: `认证失败: ${authError.message}` }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "用户不存在或令牌已过期，请重新登录" }, { status: 401 });
  }

  const body = await request.json();
  const { sessionId } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "缺少会话ID" }, { status: 400 });
  }

  const session = uploadSessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: "上传会话不存在或已过期" }, { status: 404 });
  }

  if (session.uploadedChunks.size !== session.totalChunks || session.chunks.some((part) => !part)) {
    return NextResponse.json({ 
      error: `分块不完整，已上传 ${session.uploadedChunks.size}/${session.totalChunks}` 
    }, { status: 400 });
  }

  try {
    // 合并所有分块
    const completeBuffer = Buffer.concat(session.chunks);
    console.log(`合并完成: ${session.fileName}, 大小: ${(completeBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    // 上传到对象存储
    const { uploadFile } = await import("@/lib/storage");
    const fileKey = await uploadFile(completeBuffer, session.fileName, session.mimeType);

    // 检查是否是图片
    const isImage = session.mimeType.startsWith("image/");
    let previewUrl: string | null = null;
    if (isImage) {
      previewUrl = await getFileUrl(fileKey, 30 * 24 * 3600);
    }

    // 保存到数据库
    // 所有用户上传的资料都需要审核
    const { data, error } = await client
      .from("files")
      .insert({
        title: session.title,
        description: session.description,
        file_name: session.fileName,
        file_key: fileKey,
        file_size: completeBuffer.length,
        file_type: session.fileName.split(".").pop() || "unknown",
        mime_type: session.mimeType,
        category_id: session.categoryId,
        uploader_id: user.id,
        semester: session.semester,
        course: session.course,
        tags: session.tags,
        preview_url: previewUrl,
        is_active: false, // 所有用户上传都需要审核
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // 查询分类名称
    const { data: category } = await client
      .from("categories")
      .select("name")
      .eq("id", session.categoryId)
      .single();

    // 清理会话
    uploadSessions.delete(sessionId);

    return NextResponse.json({
      success: true,
      file: { ...data, categories: category },
      needsReview: true, // 所有上传都需要审核
    });
  } catch (error) {
    console.error("完成上传失败:", error);
    return NextResponse.json({ 
      error: `上传失败: ${error instanceof Error ? error.message : '未知错误'}` 
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
