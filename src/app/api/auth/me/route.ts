import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      );
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json(
        { error: "无效的令牌" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to load profile:", profileError);
    }

    return NextResponse.json({
      user,
      profile: profile || null,
      points: null,
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "获取用户信息失败" },
      { status: 500 }
    );
  }
}
