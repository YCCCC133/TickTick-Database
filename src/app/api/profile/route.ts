import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 更新当前用户的个人资料
export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const { name, avatar } = body;

    // 构建更新数据
    const updates: Record<string, any> = {};
    
    if (name !== undefined) {
      // 验证昵称
      if (typeof name !== "string") {
        return NextResponse.json({ error: "昵称格式不正确" }, { status: 400 });
      }
      if (name.trim().length === 0) {
        return NextResponse.json({ error: "昵称不能为空" }, { status: 400 });
      }
      if (name.length > 20) {
        return NextResponse.json({ error: "昵称最多20个字符" }, { status: 400 });
      }
      updates.name = name.trim();
    }

    if (avatar !== undefined) {
      // 验证头像URL
      if (avatar !== null && typeof avatar !== "string") {
        return NextResponse.json({ error: "头像格式不正确" }, { status: 400 });
      }
      updates.avatar = avatar;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "没有需要更新的内容" }, { status: 400 });
    }

    // 更新用户资料
    const { data: updatedProfile, error: updateError } = await client
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json({ error: "更新失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

// 获取当前用户的个人资料
export async function GET(request: NextRequest) {
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

    // 获取用户资料
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return NextResponse.json({ error: "获取资料失败" }, { status: 500 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: "获取资料失败" }, { status: 500 });
  }
}
