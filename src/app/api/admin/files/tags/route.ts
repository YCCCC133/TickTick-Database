import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/**
 * PATCH: 更新文件标签
 * Body: { fileId: string, tags: string[] }
 */
export async function PATCH(request: NextRequest) {
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

    // 检查权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限操作" }, { status: 403 });
    }

    const body = await request.json();
    const { fileId, tags } = body;

    if (!fileId) {
      return NextResponse.json({ error: "缺少文件ID" }, { status: 400 });
    }

    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: "标签必须是数组" }, { status: 400 });
    }

    // 验证标签格式
    const validTags = tags
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length <= 50)
      .slice(0, 10); // 最多10个标签

    // 更新标签
    const { error: updateError } = await client
      .from("files")
      .update({ tags: validTags, updated_at: new Date().toISOString() })
      .eq("id", fileId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      message: "标签更新成功",
      tags: validTags 
    });
  } catch (error) {
    console.error("Update tags error:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/**
 * POST: 批量更新文件标签
 * Body: { fileIds: string[], tags: string[] }
 */
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

    // 检查权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限操作" }, { status: 403 });
    }

    const body = await request.json();
    const { fileIds, tags } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: "请提供文件ID列表" }, { status: 400 });
    }

    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: "标签必须是数组" }, { status: 400 });
    }

    // 验证标签格式
    const validTags = tags
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length <= 50)
      .slice(0, 10); // 最多10个标签

    // 批量更新标签
    const { error: updateError } = await client
      .from("files")
      .update({ tags: validTags, updated_at: new Date().toISOString() })
      .in("id", fileIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      message: `已更新 ${fileIds.length} 个文件的标签`,
      count: fileIds.length,
      tags: validTags
    });
  } catch (error) {
    console.error("Batch update tags error:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
