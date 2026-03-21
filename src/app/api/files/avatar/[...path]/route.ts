import { NextRequest, NextResponse } from "next/server";
import { readFile } from "@/lib/storage";

/**
 * 头像/图片公开访问接口
 * 无需登录即可访问
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    
    // 重建文件key
    const key = path.join('/');
    
    if (!key) {
      return NextResponse.json({ error: "文件路径无效" }, { status: 400 });
    }

    // 从COS读取文件
    const fileBuffer = await readFile(key);
    
    if (!fileBuffer) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // 根据扩展名判断MIME类型
    const ext = key.split('.').pop()?.toLowerCase() || 'bin';
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Avatar fetch error:", error);
    return NextResponse.json({ error: "文件加载失败" }, { status: 500 });
  }
}
