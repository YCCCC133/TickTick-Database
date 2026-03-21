import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getFileUrl } from "@/lib/storage";

/**
 * 文件代理接口
 * 用于解决跨域问题和预签名URL过期问题
 * 前端通过此接口获取文件，避免直接访问 COS
 * 
 * 支持场景：
 * 1. 前端PDF/图片预览
 * 2. WPS Office在线预览服务
 * 3. 文件下载
 * 
 * 权限说明：
 * - 普通用户只能访问已上架文件（is_active=true）
 * - 管理员可以访问所有文件（包括待审核文件）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    
    // 支持多种方式获取 token：
    // 1. URL 参数（用于 PDF.js 等无法传递 header 的场景）
    // 2. Authorization header
    // 3. Cookie（用于浏览器请求，解决代理转发丢失参数的问题）
    const tokenFromUrl = url.searchParams.get("token");
    const tokenFromHeader = request.headers.get("authorization")?.replace("Bearer ", "");
    const tokenFromCookie = request.cookies.get("auth_token")?.value;
    
    const token = tokenFromUrl || tokenFromHeader || tokenFromCookie;
    
    // 调试日志
    console.log("[Proxy] Token sources - URL:", !!tokenFromUrl, "Header:", !!tokenFromHeader, "Cookie:", !!tokenFromCookie);
    console.log("[Proxy] All cookies:", request.cookies.getAll().map(c => c.name).join(", "));
    
    // 检查是否是下载模式
    const isDownload = url.searchParams.get("download") === "1";
    
    // 使用带 token 的客户端（如果提供了 token）
    const client = token ? getSupabaseClient(token) : getSupabaseClient();

    // 获取文件信息
    const { data: file, error } = await client
      .from("files")
      .select("file_key, file_name, mime_type, is_active")
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
          { error: "文件待审核，暂不可访问" },
          { status: 403 }
        );
      }
    }

    const directUrl = await getFileUrl(file.file_key, 3600);
    if (!directUrl) {
      return NextResponse.json({ error: "文件读取失败" }, { status: 500 });
    }

    const forwardHeaders: Record<string, string> = {};
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      forwardHeaders.Range = rangeHeader;
    }

    const upstream = await fetch(directUrl, {
      headers: forwardHeaders,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `文件读取失败: ${upstream.status}` },
        { status: 500 }
      );
    }

    // 对文件名进行安全编码（支持中文）
    const safeFileName = file.file_name.replace(/[^\x00-\x7F]/g, "_") || "file";
    const encodedFileName = encodeURIComponent(file.file_name);
    const contentDisposition = isDownload
      ? `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`
      : `inline; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || file.mime_type || "application/octet-stream");
    headers.set("Content-Disposition", contentDisposition);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Content-Disposition, Accept-Ranges");

    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (contentLength) headers.set("Content-Length", contentLength);
    if (contentRange) headers.set("Content-Range", contentRange);
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error("File proxy error:", error);
    return NextResponse.json(
      { error: "文件加载失败" },
      { status: 500 }
    );
  }
}

// 支持 OPTIONS 请求（CORS 预检）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
      "Access-Control-Max-Age": "86400",
    },
  });
}
