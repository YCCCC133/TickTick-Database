import { NextRequest, NextResponse } from "next/server";
import { readFile } from "@/lib/storage";

/**
 * 预览图代理接口
 * 用于访问上传的PDF预览图
 * 路径格式: /api/files/preview/preview/{fileId}.png
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    
    // 重建文件key
    const fileKey = path.join("/");
    
    console.log(`[Preview Proxy] 请求预览图: ${fileKey}`);

    // 从COS读取文件
    const fileBuffer = await readFile(fileKey);
    
    if (!fileBuffer) {
      return NextResponse.json(
        { error: "预览图不存在" },
        { status: 404 }
      );
    }

    // 返回图片
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable", // 缓存1年
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Preview proxy error:", error);
    return NextResponse.json(
      { error: "预览图加载失败" },
      { status: 500 }
    );
  }
}
