import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { deductDownloadPoints, getUserPointsBalance } from "@/lib/points";
import { POINTS_CONFIG } from "@/types/points";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 检查用户登录状态
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json(
        { error: "请先登录", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "无效的令牌", code: "INVALID_TOKEN" },
        { status: 401 }
      );
    }

    // 获取文件信息
    const { data: file, error } = await client
      .from("files")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !file) {
      return NextResponse.json(
        { error: "文件不存在" },
        { status: 404 }
      );
    }

    // 检查是否是上传者自己下载（不扣积分）
    const isOwner = file.uploader_id === user.id;

    // 获取用户角色，检查是否是管理员
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    
    const isAdmin = profile?.role === "admin" || profile?.role === "volunteer";

    if (!isOwner && !isAdmin) {
      // 检查用户积分余额
      const balance = await getUserPointsBalance(user.id);
      
      if (balance < POINTS_CONFIG.DOWNLOAD_COST) {
        return NextResponse.json(
          { 
            error: `积分不足，需要 ${POINTS_CONFIG.DOWNLOAD_COST} 积分，当前余额 ${balance} 积分`,
            code: "INSUFFICIENT_POINTS",
            balance,
            required: POINTS_CONFIG.DOWNLOAD_COST
          },
          { status: 402 }
        );
      }

      // 扣除积分（如果失败，记录错误但不阻止下载）
      const deductResult = await deductDownloadPoints(user.id, id);
      if (!deductResult.success) {
        console.error("Failed to deduct points:", deductResult.error);
        // 不阻止下载，继续执行
      }
    }

    // 更新下载次数
    await client
      .from("files")
      .update({ download_count: file.download_count + 1 })
      .eq("id", id);

    // 使用代理URL而不是预签名URL（预签名URL有403问题）
    const baseUrl = request.nextUrl.origin;
    const downloadUrl = `${baseUrl}/api/files/${id}/proxy?download=1`;

    return NextResponse.json({
      downloadUrl,
      fileName: file.file_name,
      pointsDeducted: (isOwner || isAdmin) ? 0 : POINTS_CONFIG.DOWNLOAD_COST,
      isAdmin,
    });
  } catch (error) {
    console.error("Download file error:", error);
    return NextResponse.json(
      { error: "下载失败" },
      { status: 500 }
    );
  }
}
