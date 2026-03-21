import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 批量删除文件
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

    // 检查管理员权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "只有管理员可以批量删除" }, { status: 403 });
    }

    const body = await request.json();
    const { fileIds } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: "请选择要删除的文件" }, { status: 400 });
    }

    // 获取文件信息
    const { data: files } = await client
      .from("files")
      .select("id, file_key")
      .in("id", fileIds);

    // 删除数据库记录
    const { error: deleteError } = await client
      .from("files")
      .delete()
      .in("id", fileIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 删除相关的评分和评论
    await Promise.all([
      client.from("ratings").delete().in("file_id", fileIds),
      client.from("comments").delete().in("file_id", fileIds),
    ]);

    // 尝试删除对象存储中的文件
    if (files && files.length > 0) {
      const { deleteFiles } = await import("@/lib/storage");
      const result = await deleteFiles(files.map((f: { file_key: string | null }) => f.file_key));
      console.log(`[批量删除] 存储删除结果: 成功 ${result.deleted}, 失败 ${result.failed.length}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: `成功删除 ${fileIds.length} 个文件` 
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    return NextResponse.json({ error: "批量删除失败" }, { status: 500 });
  }
}
