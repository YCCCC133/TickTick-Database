import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { generateFileKey, getFileUrl, getUploadUrl, headFile } from "@/lib/storage";
import { getPublicOrigin } from "@/lib/public-origin";
import { getRequestAuthToken } from "@/lib/request-auth";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "@/config/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(request: NextRequest) {
  const token = getRequestAuthToken(request);
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

async function initDirectUpload(request: NextRequest) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { fileName, fileSize, mimeType, title, description, categoryId, semester, course, tags } = body;

  if (!fileName || !fileSize || !title || !categoryId) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: `文件大小超过限制（最大 ${MAX_FILE_SIZE_MB}MB）` }, { status: 400 });
  }

  const fileKey = generateFileKey(fileName);
  const uploadUrl = await getUploadUrl(fileKey, 3600, mimeType || "application/octet-stream");
  if (!uploadUrl) {
    return NextResponse.json({ error: "生成上传链接失败" }, { status: 500 });
  }

  return NextResponse.json({
    fileKey,
    uploadUrl,
    expiresIn: 3600,
    fileName,
    fileSize,
    mimeType: mimeType || "application/octet-stream",
    title,
    description: description || "",
    categoryId,
    semester: semester || "",
    course: course || "",
    tags: Array.isArray(tags) ? tags : [],
  });
}

async function completeDirectUpload(request: NextRequest) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { user, client, userRole } = auth;
  const isAdminOrVolunteer = userRole === "admin" || userRole === "volunteer";

  const body = await request.json();
  const { fileKey, fileName, fileSize, mimeType, title, description, categoryId, semester, course, tags } = body;

  if (!fileKey || !fileName || !title || !categoryId) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const head = await headFile(fileKey);
  if (!head) {
    return NextResponse.json({ error: "文件未成功上传到存储服务" }, { status: 400 });
  }

  const storedSize = head.contentLength || Number(fileSize || 0);
  const isImage = String(mimeType || "").startsWith("image/");
  let previewUrl: string | null = null;
  if (isImage) {
    previewUrl = await getFileUrl(fileKey, 30 * 24 * 3600);
  }

  const { data, error } = await client
    .from("files")
    .insert({
      title,
      description: description || "",
      file_name: fileName,
      file_key: fileKey,
      file_size: storedSize,
      file_type: fileName.split(".").pop() || "unknown",
      mime_type: mimeType || "application/octet-stream",
      category_id: categoryId,
      uploader_id: user.id,
      semester: semester || "",
      course: course || "",
      tags: Array.isArray(tags) ? tags : [],
      preview_url: previewUrl,
      is_active: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: category } = await client
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .single();

  const baseUrl = getPublicOrigin(request);
  return NextResponse.json({
    success: true,
    file: { ...data, categories: category, uploader: undefined },
    needsReview: true,
    uploadUrl: `${baseUrl}/api/files/${data.id}/proxy`,
    directUpload: true,
    autoReviewed: isAdminOrVolunteer,
  });
}

export async function POST(request: NextRequest) {
  const action = request.headers.get("x-upload-action");
  switch (action) {
    case "init":
      return initDirectUpload(request);
    case "complete":
      return completeDirectUpload(request);
    default:
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
  }
}
