import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getFileUrl } from "@/lib/storage";

/**
 * 获取文件预览URL
 * 用于前端渲染PDF或其他文件预览
 * 
 * 返回两种URL：
 * 1. directUrl - 直接访问 COS 的预签名 URL（速度快）
 * 2. proxyUrl - 通过服务器代理访问（fallback方案）
 * 
 * 权限说明：
 * - 普通用户只能预览已上架文件（is_active=true）
 * - 管理员可以预览所有文件（包括待审核文件）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    
    // 使用带 token 的客户端（如果提供了 token）
    const client = token ? getSupabaseClient(token) : getSupabaseClient();

    // 获取文件信息
    const { data: file, error } = await client
      .from("files")
      .select("file_key, mime_type, file_type, is_active, preview_url")
      .eq("id", id)
      .single();

    if (error || !file) {
      return NextResponse.json(
        { error: "文件不存在" },
        { status: 404 }
      );
    }

    // 检查权限：非上架文件需要管理员权限
    if (!file.is_active) {
      // 检查是否是管理员
      let isAdmin = false;
      if (token) {
        try {
          const { data: { user } } = await client.auth.getUser(token);
          if (user) {
            const { data: profile } = await client
              .from("profiles")
              .select("role")
              .eq("user_id", user.id)
              .single();
            isAdmin = profile?.role === "admin" || profile?.role === "volunteer";
          }
        } catch {
          // 忽略认证错误
        }
      }
      
      if (!isAdmin) {
        return NextResponse.json(
          { error: "文件待审核，暂不可预览" },
          { status: 403 }
        );
      }
    }

    // 是否可预览（图片或PDF）
    const isPreviewable = 
      file.mime_type?.startsWith("image/") || 
      file.mime_type === "application/pdf";

    // 生成代理 URL（通过当前请求 origin 访问，保证同源）
    const baseUrl = request.nextUrl.origin;
    // 如果有 token，附加到 URL 参数中（用于 PDF.js 等无法传递 header 的场景）
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const proxyUrl = `${baseUrl}/api/files/${id}/proxy${tokenParam}`;

    // 生成直接访问 URL（预签名 URL，7天有效期）
    // 优先直连 COS，失败时再退回代理 URL
    let directUrl: string | null = null;
    try {
      directUrl = await getFileUrl(file.file_key, 604800); // 7天
    } catch (urlError) {
      console.error("[Thumbnail] Failed to generate direct URL:", urlError);
    }

    // 构建响应 - 优先使用proxyUrl
    const response: Record<string, any> = {
      directUrl: directUrl || proxyUrl,
      proxyUrl,
      mimeType: file.mime_type,
      fileType: file.file_type,
      isPreviewable,
      hasPreview: false,
    };

    // 如果已有预览图，同时返回
    if (file.preview_url) {
      response.previewUrl = file.preview_url;
      response.hasPreview = true;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get file preview URL error:", error);
    return NextResponse.json(
      { error: "获取预览失败" },
      { status: 500 }
    );
  }
}
