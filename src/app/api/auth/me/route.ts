import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { POINTS_CONFIG } from "@/types/points";

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

    // 并行获取用户资料和积分
    const [profileResult, pointsResult] = await Promise.all([
      client
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      client
        .from("user_points")
        .select("balance, total_earned, total_spent")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    let profile = profileResult.data;
    let points = pointsResult.data;

    // 如果 profile 不存在，创建一个默认的
    if (!profile && !profileResult.error) {
      console.log("Creating default profile for user:", user.id);
      const { data: newProfile, error: createError } = await client
        .from("profiles")
        .insert({
          user_id: user.id,
          email: user.email || "",
          name: user.email?.split("@")[0] || "用户",
          role: "guest",
        })
        .select()
        .single();
      
      if (!createError && newProfile) {
        profile = newProfile;
      }
    }

    // 如果积分不存在，创建默认积分（延迟创建，不阻塞响应）
    if (!points && !pointsResult.error) {
      const { data: newPoints } = await client
        .from("user_points")
        .insert({
          user_id: user.id,
          balance: POINTS_CONFIG.REGISTER_BONUS,
          total_earned: POINTS_CONFIG.REGISTER_BONUS,
          total_spent: 0,
        })
        .select("balance, total_earned, total_spent")
        .single();
      
      if (newPoints) {
        points = newPoints;
        
        // 异步记录注册奖励（不阻塞响应）
        void client.from("point_transactions").insert({
          user_id: user.id,
          amount: POINTS_CONFIG.REGISTER_BONUS,
          type: "register_bonus",
          description: "新用户注册奖励",
        });
      }
    }

    return NextResponse.json({
      user,
      profile: profile || null,
      points: points || { balance: POINTS_CONFIG.REGISTER_BONUS, total_earned: POINTS_CONFIG.REGISTER_BONUS, total_spent: 0 },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "获取用户信息失败" },
      { status: 500 }
    );
  }
}
