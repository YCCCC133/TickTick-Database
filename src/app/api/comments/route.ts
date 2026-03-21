import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

type CommentRow = {
  user_id: string;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  avatar: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        { error: "缺少文件ID" },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    
    // 不使用关联查询，直接获取评论
    const { data, error } = await client
      .from("comments")
      .select("*")
      .eq("file_id", fileId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get comments error:", error);
      return NextResponse.json(
        { comments: [], error: error.message },
        { status: 200 } // 返回空数组，不阻塞页面
      );
    }

    // 获取所有用户ID
    const userIds = [...new Set((data || []).map((c: CommentRow) => c.user_id).filter(Boolean) || [])];
    
    // 批量查询用户信息 - 使用 user_id 关联
    const profilesMap: Record<string, { name: string; avatar?: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await client
        .from("profiles")
        .select("user_id, name, avatar")
        .in("user_id", userIds);
      
      profiles?.forEach((p: ProfileRow) => {
        profilesMap[p.user_id] = { name: p.name, avatar: p.avatar };
      });
    }

    // 组装数据
    const commentsWithProfiles = (data || []).map((comment: CommentRow & Record<string, unknown>) => ({
      ...comment,
      profiles: profilesMap[comment.user_id] || null,
    }));

    return NextResponse.json({ comments: commentsWithProfiles });
  } catch (error) {
    console.error("Get comments error:", error);
    return NextResponse.json(
      { comments: [], error: "获取评论失败" },
      { status: 200 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const { fileId, content, parentId } = body;

    if (!fileId || !content || !content.trim()) {
      return NextResponse.json(
        { error: "请输入评论内容" },
        { status: 400 }
      );
    }

    // 检查文件是否存在
    const { data: file, error: fileError } = await client
      .from("files")
      .select("id")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: "文件不存在" },
        { status: 404 }
      );
    }

    const { data, error } = await client
      .from("comments")
      .insert({
        file_id: fileId,
        user_id: user.id,
        content: content.trim(),
        parent_id: parentId || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Create comment error:", error);
      return NextResponse.json(
        { error: error.message || "评论失败，请稍后重试" },
        { status: 400 }
      );
    }

    // 获取用户信息
    const { data: profile } = await client
      .from("profiles")
      .select("name, avatar")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({
      success: true,
      comment: { ...data, profiles: profile },
    });
  } catch (error) {
    console.error("Create comment error:", error);
    return NextResponse.json(
      { error: "评论失败，请稍后重试" },
      { status: 500 }
    );
  }
}
