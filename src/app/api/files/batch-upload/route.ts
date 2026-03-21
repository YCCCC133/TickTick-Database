import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { uploadFile } from "@/lib/storage";
import { getRequestAuthToken } from "@/lib/request-auth";

const FILE_UPLOAD_CONCURRENCY = 3;

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
}

// AI 智能分类函数
async function classifyFiles(
  fileNames: string[],
  headers: Record<string, string>,
  baseUrl: string
): Promise<Record<string, string>> {
  try {
    // 调用分类 API
    const response = await fetch(`${baseUrl}/api/files/classify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ fileNames }),
    });

    if (response.ok) {
      const data = await response.json();
      const categoryMap: Record<string, string> = {};
      for (const result of data.results || []) {
        categoryMap[result.fileName] = result.category;
      }
      return categoryMap;
    }
  } catch (error) {
    console.error("AI classification error:", error);
  }
  return {};
}

// 批量上传文件
export async function POST(request: NextRequest) {
  try {
    const baseUrl = request.nextUrl.origin;
    const token = getRequestAuthToken(request);
    
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "无效的令牌" }, { status: 401 });
    }

    // 检查权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限上传" }, { status: 403 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const categoryMapJson = formData.get("categoryMap") as string;
    const manualCategoryMap = categoryMapJson ? JSON.parse(categoryMapJson) : {};
    const useAiClassify = formData.get("useAiClassify") === "true";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "没有上传文件" }, { status: 400 });
    }

    // 获取分类列表
    const { data: categories } = await client
      .from("categories")
      .select("id, name");

    const categoryMap_byName: Record<string, string> = {};
    categories?.forEach((cat: { id: string; name: string }) => {
      categoryMap_byName[cat.name] = cat.id;
    });

    // 如果启用 AI 分类且没有手动分类，则进行 AI 分类
    let aiCategoryMap: Record<string, string> = {};
    if (useAiClassify && Object.keys(manualCategoryMap).length === 0) {
      const fileNames = files.map(f => f.name);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      aiCategoryMap = await classifyFiles(fileNames, headers, baseUrl);
      console.log("AI 分类结果:", aiCategoryMap);
    }

    // 批量处理文件，有限并发上传
    const processed = await mapWithConcurrency(files, FILE_UPLOAD_CONCURRENCY, async (file) => {
      try {
        // 获取文件扩展名
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const mimeType = getMimeType(ext);

        // 上传到对象存储
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileKey = await uploadFile(buffer, file.name, mimeType);

        // 获取分类ID（优先级：手动选择 > AI分类 > 默认分类）
        const categoryName = manualCategoryMap[file.name] || aiCategoryMap[file.name];
        const categoryId = categoryMap_byName[categoryName] || categoryMap_byName["学习资料"];

        // 生成标题（去除扩展名）
        const title = file.name.replace(/\.[^/.]+$/, "");

        // 插入数据库
        const { data: fileRecord, error: insertError } = await client
          .from("files")
          .insert({
            title,
            file_name: file.name,
            file_key: fileKey,
            file_size: file.size,
            file_type: ext,
            mime_type: mimeType,
            category_id: categoryId,
            uploader_id: user.id,
            is_active: false, // 所有上传都需要审核
            is_featured: false,
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        return {
          fileName: file.name,
          success: true,
          fileId: fileRecord.id,
          category: categoryName || "学习资料",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "上传失败";
        return { fileName: file.name, success: false, error: message };
      }
    });

    const results = processed.filter((item) => item.success);
    const errors = processed.filter((item) => !item.success);

    return NextResponse.json({
      success: true,
      uploaded: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error("Batch upload error:", error);
    return NextResponse.json({ error: "批量上传失败" }, { status: 500 });
  }
}

// 获取 MIME 类型
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    txt: "text/plain",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}
