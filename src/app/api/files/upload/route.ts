import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { uploadFile, getFileUrl } from "@/lib/storage";
import { PDFDocument } from "pdf-lib";
import { getRequestAuthToken } from "@/lib/request-auth";

// Next.js App Router 配置
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 最大文件大小限制 (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024;
// PDF 压缩阈值 (10MB)
const PDF_COMPRESS_THRESHOLD = 10 * 1024 * 1024;

/**
 * 压缩 PDF 文件
 * 使用 pdf-lib 进行优化，移除重复资源，压缩图像
 */
async function compressPDF(buffer: Buffer): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { 
      ignoreEncryption: true,
      updateMetadata: false 
    });
    
    // 获取压缩后的字节
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true, // 使用对象流压缩
      addDefaultPage: false,
      objectsPerTick: 50, // 分批处理，避免阻塞
    });
    
    return Buffer.from(compressedBytes);
  } catch (error) {
    console.error("PDF compression error:", error);
    // 压缩失败则返回原始文件
    return buffer;
  }
}

export async function POST(request: NextRequest) {
  console.log("=== Upload API called ===");
  console.log("Request headers:", Object.fromEntries(request.headers.entries()));
  
  try {
    // 先尝试读取请求体大小
    const contentLength = request.headers.get("content-length");
    console.log(`Content-Length: ${contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'}`);
    
    const token = getRequestAuthToken(request);
    
    if (!token) {
      console.log("Upload failed: No token");
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      );
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError) {
      console.log("Upload auth error:", authError.message, authError.status);
      return NextResponse.json(
        { error: `认证失败: ${authError.message}` },
        { status: 401 }
      );
    }

    if (!user) {
      console.log("Upload failed: No user found for token");
      return NextResponse.json(
        { error: "用户不存在或令牌已过期，请重新登录" },
        { status: 401 }
      );
    }

    console.log("User authenticated:", user.email);

    // 获取用户角色
    const { data: userProfile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    
    const userRole = userProfile?.role || "guest";
    const isAdminOrVolunteer = userRole === "admin" || userRole === "volunteer";
    console.log(`User role: ${userRole}, can auto-publish: ${isAdminOrVolunteer}`);

    // 解析 formData
    let formData: FormData;
    try {
      formData = await request.formData();
      console.log("FormData parsed successfully");
    } catch (formError) {
      console.error("FormData parse error:", formError);
      return NextResponse.json(
        { error: "无法解析上传数据，文件可能太大" },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const categoryId = formData.get("categoryId") as string;
    const semester = formData.get("semester") as string;
    const course = formData.get("course") as string;
    const tags = JSON.parse(formData.get("tags") as string || "[]");

    console.log(`File info: name=${file?.name}, size=${file?.size}, type=${file?.type}`);
    console.log(`Metadata: title=${title}, categoryId=${categoryId}`);

    if (!file || !title || !categoryId) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` },
        { status: 400 }
      );
    }

    // 读取文件内容
    console.log(`Reading file into buffer...`);
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
      console.log(`Buffer created: ${buffer.length} bytes`);
    } catch (bufferError) {
      console.error("Buffer creation error:", bufferError);
      return NextResponse.json(
        { error: "文件读取失败" },
        { status: 500 }
      );
    }

    const isPDF = file.type === "application/pdf";
    let wasCompressed = false;
    const originalSize = file.size;

    // PDF 自动压缩
    if (isPDF && file.size > PDF_COMPRESS_THRESHOLD) {
      console.log(`开始压缩PDF: ${file.name}, 原始大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      try {
        const compressedBuffer = await compressPDF(buffer);
        
        // 只有压缩后变小才使用压缩版本
        if (compressedBuffer.length < buffer.length) {
          buffer = compressedBuffer;
          wasCompressed = true;
          console.log(`PDF压缩完成: ${file.name}, 压缩后: ${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB, 压缩率: ${((1 - compressedBuffer.length / originalSize) * 100).toFixed(1)}%`);
        } else {
          console.log(`PDF压缩效果不明显，保留原文件: ${file.name}`);
        }
      } catch (compressError) {
        console.error("PDF压缩失败，使用原始文件:", compressError);
      }
    }

    // 上传文件到对象存储
    console.log(`Uploading to storage...`);
    let fileKey: string;
    try {
      fileKey = await uploadFile(buffer, file.name, file.type);
      console.log(`Upload successful, key: ${fileKey}`);
    } catch (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `存储上传失败: ${uploadError instanceof Error ? uploadError.message : '未知错误'}` },
        { status: 500 }
      );
    }

    // 检查是否是图片文件 - 图片需要预览URL
    const isImage = file.type.startsWith("image/");
    let previewUrl: string | null = null;
    
    if (isImage) {
      // 图片文件直接使用文件本身作为预览
      previewUrl = await getFileUrl(fileKey, 30 * 24 * 3600);
    }

    // 保存文件元数据到数据库
    // 所有用户上传的资料都需要审核
    const { data, error } = await client
      .from("files")
      .insert({
        title,
        description,
        file_name: file.name,
        file_key: fileKey,
        file_size: wasCompressed ? buffer.length : file.size, // 使用压缩后的大小
        file_type: file.name.split(".").pop() || "unknown",
        mime_type: file.type,
        category_id: categoryId,
        uploader_id: user.id,
        semester,
        course,
        tags,
        preview_url: previewUrl, // 只有图片有预览URL
        is_active: false, // 所有用户上传都需要审核
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // 单独查询分类名称
    const { data: category } = await client
      .from("categories")
      .select("name")
      .eq("id", categoryId)
      .single();

    return NextResponse.json({
      success: true,
      file: { ...data, categories: category },
      needsReview: true, // 所有上传都需要审核
      compression: wasCompressed ? {
        originalSize,
        compressedSize: buffer.length,
        ratio: ((1 - buffer.length / originalSize) * 100).toFixed(1) + "%"
      } : undefined,
    });
  } catch (error) {
    console.error("Upload file error:", error);
    const errorMessage = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
