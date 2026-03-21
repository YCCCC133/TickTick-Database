import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getUploadUrl } from "@/lib/storage";
import { getPublicOrigin } from "@/lib/public-origin";
import { getRequestAuthToken } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

function buildAvatarKey(userId: string, fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `avatars/${userId}/${timestamp}_${random}.${ext}`;
}

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

  return { client, user };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const { user } = auth;
    const body = await request.json();
    const { fileName, fileSize, mimeType } = body;

    if (!fileName || !fileSize) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (typeof mimeType !== "string" || !mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "头像必须是图片文件" }, { status: 400 });
    }

    if (Number(fileSize) > MAX_AVATAR_SIZE) {
      return NextResponse.json({ error: "头像大小不能超过2MB" }, { status: 400 });
    }

    const fileKey = buildAvatarKey(user.id, fileName);
    const uploadUrl = await getUploadUrl(fileKey, 1800, mimeType);
    if (!uploadUrl) {
      return NextResponse.json({ error: "生成上传链接失败" }, { status: 500 });
    }

    const baseUrl = getPublicOrigin(request);
    return NextResponse.json({
      fileKey,
      uploadUrl,
      url: `${baseUrl}/api/files/avatar/${fileKey}`,
      expiresIn: 1800,
    });
  } catch (error) {
    console.error("Avatar direct init error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "头像上传失败" },
      { status: 500 }
    );
  }
}
