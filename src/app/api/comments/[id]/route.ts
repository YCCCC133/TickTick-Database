import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // 获取评论信息
    const { data: comment, error: commentError } = await client
      .from("comments")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (commentError || !comment) {
      return NextResponse.json(
        { error: "评论不存在" },
        { status: 404 }
      );
    }

    // 获取当前用户角色
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const userRole = profile?.role || "guest";
    const isAdmin = userRole === "admin";
    const isVolunteer = userRole === "volunteer" || isAdmin;
    const isOwner = comment.user_id === user.id;

    // 权限检查：只有评论本人、管理员或志愿者可以删除
    if (!isOwner && !isVolunteer) {
      return NextResponse.json(
        { error: "无权删除此评论" },
        { status: 403 }
      );
    }

    // 软删除评论
    const { error: deleteError } = await client
      .from("comments")
      .update({ is_active: false })
      .eq("id", id);

    if (deleteError) {
      console.error("Delete comment error:", deleteError);
      return NextResponse.json(
        { error: "删除失败，请稍后重试" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "评论已删除",
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    return NextResponse.json(
      { error: "删除失败，请稍后重试" },
      { status: 500 }
    );
  }
}
