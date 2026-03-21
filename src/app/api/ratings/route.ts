import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

type RatingRow = {
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
    
    // 不使用关联查询，直接获取评分
    const { data, error } = await client
      .from("ratings")
      .select("*")
      .eq("file_id", fileId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get ratings error:", error);
      return NextResponse.json(
        { ratings: [], error: error.message },
        { status: 200 }
      );
    }

    // 获取所有用户ID
    const userIds = [...new Set((data || []).map((r: RatingRow) => r.user_id).filter(Boolean) || [])];
    
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
    const ratingsWithProfiles = (data || []).map((rating: RatingRow & Record<string, unknown>) => ({
      ...rating,
      profiles: profilesMap[rating.user_id] || null,
    }));

    return NextResponse.json({ ratings: ratingsWithProfiles });
  } catch (error) {
    console.error("Get ratings error:", error);
    return NextResponse.json(
      { ratings: [], error: "获取评分失败" },
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
    const { fileId, score } = body;

    if (!fileId || !score || score < 1 || score > 5) {
      return NextResponse.json(
        { error: "请选择评分（1-5分）" },
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

    // 检查是否已评分
    const { data: existingRating } = await client
      .from("ratings")
      .select("id")
      .eq("file_id", fileId)
      .eq("user_id", user.id)
      .maybeSingle();

    let data, error;
    
    if (existingRating) {
      // 更新评分
      const result = await client
        .from("ratings")
        .update({ score })
        .eq("id", existingRating.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // 新增评分
      const result = await client
        .from("ratings")
        .insert({
          file_id: fileId,
          user_id: user.id,
          score,
        })
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Rating error:", error);
      return NextResponse.json(
        { error: error.message || "评分失败，请稍后重试" },
        { status: 400 }
      );
    }

    // 更新文件的平均评分
    const { data: ratings } = await client
      .from("ratings")
      .select("score")
      .eq("file_id", fileId);

    if (ratings && ratings.length > 0) {
      const avgRating = ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;
      await client
        .from("files")
        .update({
          average_rating: avgRating.toFixed(2),
          rating_count: ratings.length,
        })
        .eq("id", fileId);
    }

    return NextResponse.json({
      success: true,
      rating: data,
    });
  } catch (error) {
    console.error("Rate file error:", error);
    return NextResponse.json(
      { error: "评分失败，请稍后重试" },
      { status: 500 }
    );
  }
}
