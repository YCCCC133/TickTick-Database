import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { uploadFile } from "@/lib/storage";

/**
 * 保存PDF预览图
 * 前端渲染PDF首页后上传预览图
 * 注意：允许匿名上传预览图，因为这是为了提升用户体验
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const baseUrl = request.nextUrl.origin;
    const client = getSupabaseClient();

    // 获取文件信息 - 不需要登录，只需要文件存在且已上架
    const { data: file, error } = await client
      .from("files")
      .select("id, preview_url, is_active")
      .eq("id", id)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    if (!file.is_active) {
      return NextResponse.json({ error: "文件已下架" }, { status: 404 });
    }

    // 如果已有预览图，直接返回
    if (file.preview_url) {
      return NextResponse.json({ 
        success: true, 
        previewUrl: file.preview_url,
        message: "预览图已存在" 
      });
    }

    // 解析请求体 - 获取图片数据
    const formData = await request.formData();
    const imageFile = formData.get("image") as File;
    
    if (!imageFile) {
      return NextResponse.json({ error: "缺少预览图片" }, { status: 400 });
    }

    // 将File转为Buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传到对象存储 - 使用preview目录
    const previewKey = await uploadFile(
      buffer,
      `preview/${id}.png`,
      "image/png"
    );

    // 使用代理URL而不是预签名URL（避免403问题）
    const previewUrl = `${baseUrl}/api/files/preview/${previewKey}`;

    // 更新数据库
    const { error: updateError } = await client
      .from("files")
      .update({ preview_url: previewUrl })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update preview_url:", updateError);
      return NextResponse.json({ error: "保存预览图失败" }, { status: 500 });
    }

    console.log(`[Preview] 预览图保存成功: ${id} -> ${previewUrl}`);

    return NextResponse.json({ 
      success: true, 
      previewUrl,
      message: "预览图已保存" 
    });
  } catch (error) {
    console.error("Save preview error:", error);
    return NextResponse.json({ error: "保存预览图失败" }, { status: 500 });
  }
}
