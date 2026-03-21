import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { POINTS_CONFIG } from "@/types/points";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "邮箱和密码不能为空" },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Auth error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    // 并行获取用户资料和积分
    const [profileResult, pointsResult] = await Promise.all([
      client
        .from("profiles")
        .select("*")
        .eq("user_id", data.user.id)
        .maybeSingle(),
      client
        .from("user_points")
        .select("balance, total_earned, total_spent")
        .eq("user_id", data.user.id)
        .maybeSingle(),
    ]);

    let profile = profileResult.data;
    let points = pointsResult.data;

    // 如果 profile 不存在，自动创建
    if (!profile && !profileResult.error) {
      console.log("Creating profile for user:", data.user.id);
      const { data: newProfile, error: createError } = await client
        .from("profiles")
        .insert({
          user_id: data.user.id,
          email: data.user.email || email,
          name: email.split("@")[0],
          role: "guest",
        })
        .select()
        .single();
      
      if (createError) {
        console.error("Failed to create profile:", createError);
      } else {
        profile = newProfile;
      }
    }

    // 如果积分不存在，创建默认积分
    if (!points && !pointsResult.error) {
      const { data: newPoints } = await client
        .from("user_points")
        .insert({
          user_id: data.user.id,
          balance: POINTS_CONFIG.REGISTER_BONUS,
          total_earned: POINTS_CONFIG.REGISTER_BONUS,
          total_spent: 0,
        })
        .select("balance, total_earned, total_spent")
        .single();
      
      if (newPoints) {
        points = newPoints;
        
        // 异步记录注册奖励
        void client.from("point_transactions").insert({
          user_id: data.user.id,
          amount: POINTS_CONFIG.REGISTER_BONUS,
          type: "register_bonus",
          description: "新用户注册奖励",
        });
      }
    }

    console.log("Login response:", {
      email: data.user.email,
      profileId: profile?.id,
      profileRole: profile?.role,
      pointsBalance: points?.balance,
    });

    // 确保返回完整的 session 信息
    const sessionData = data.session ? {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    } : null;

    return NextResponse.json({
      success: true,
      user: data.user,
      profile,
      points: points || { balance: POINTS_CONFIG.REGISTER_BONUS, total_earned: POINTS_CONFIG.REGISTER_BONUS, total_spent: 0 },
      session: sessionData,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "登录失败" },
      { status: 500 }
    );
  }
}
