import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/**
 * 获取Office文档预览URL
 * 
 * 使用代理URL供WPS预览服务使用
 * WPS预览服务通过我们的代理接口访问文件
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = getSupabaseClient();

    // 获取文件信息 - 不需要登录即可预览已上架文件
    const { data: file, error } = await client
      .from("files")
      .select("file_key, file_name, mime_type, is_active")
      .eq("id", id)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    if (!file.is_active) {
      return NextResponse.json({ error: "文件已下架" }, { status: 404 });
    }

    // 检查是否是Office文档
    const officeTypes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
      "application/msword", // doc
      "application/vnd.ms-excel", // xls
      "application/vnd.ms-powerpoint", // ppt
    ];

    if (!officeTypes.includes(file.mime_type || "")) {
      return NextResponse.json({ error: "不是Office文档" }, { status: 400 });
    }

    // 使用代理URL（WPS需要公网可访问的URL）
    const domain = process.env.COZE_PROJECT_DOMAIN_DEFAULT || "localhost:5000";
    const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    const proxyUrl = `${baseUrl}/api/files/${id}/proxy`;

    console.log("[Office Preview] 代理URL:", proxyUrl);

    return NextResponse.json({ 
      success: true, 
      url: proxyUrl,
      fileName: file.file_name,
      mimeType: file.mime_type,
    });
  } catch (error) {
    console.error("Get office preview URL error:", error);
    return NextResponse.json({ error: "获取预览URL失败" }, { status: 500 });
  }
}
