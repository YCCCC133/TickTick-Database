import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

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

    // 仅获取登录后立即需要的资料，其他信息延后到前端空闲期补齐
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("*")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to load profile:", profileError);
    }

    // 如果 profile 不存在，异步补建，不阻塞登录响应
    if (!profile && !profileError) {
      void client.from("profiles").insert({
        user_id: data.user.id,
        email: data.user.email || email,
        name: email.split("@")[0],
        role: "guest",
      });
    }

    // 登录响应不再同步拉取积分，交给前端空闲期补查
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
      points: null,
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
