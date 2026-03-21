import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { uploadFile, getFileUrl } from "@/lib/storage";
import { getPublicOrigin } from "@/lib/public-origin";

/**
 * 通用文件上传接口
 * 支持头像上传、预览图上传等
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "无效的令牌" }, { status: 401 });
    }

    // 解析 multipart/form-data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    }

    // 根据类型验证文件
    if (type === "avatar") {
      // 头像验证
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "头像必须是图片文件" }, { status: 400 });
      }
      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json({ error: "头像大小不能超过2MB" }, { status: 400 });
      }
    } else if (type === "preview") {
      // 预览图验证
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "预览图必须是图片文件" }, { status: 400 });
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "预览图大小不能超过5MB" }, { status: 400 });
      }
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 生成文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split('.').pop() || 'bin';
    const fileName = `avatars/${user.id}/${timestamp}_${random}.${ext}`;

    // 上传到COS
    const key = await uploadFile(buffer, fileName, file.type);
    
    // 生成访问URL（使用代理URL，避免预签名URL的403问题）
    const baseUrl = getPublicOrigin(request);
    const url = `${baseUrl}/api/files/avatar/${key}`;

    console.log(`[Upload] 头像上传成功: ${key}`);

    return NextResponse.json({
      success: true,
      url,
      key,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 500 }
    );
  }
}
