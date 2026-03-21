import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/**
 * 刷新会话 Token
 * 使用 refresh_token 获取新的 access_token
 */
export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: "缺少 refresh_token" },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    
    // 使用 refresh_token 刷新会话
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      console.error("Refresh session error:", error);
      return NextResponse.json(
        { error: "会话刷新失败，请重新登录" },
        { status: 401 }
      );
    }

    if (!data.session || !data.user) {
      return NextResponse.json(
        { error: "会话已过期，请重新登录" },
        { status: 401 }
      );
    }

    // 返回新的会话信息
    return NextResponse.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
      },
      user: data.user,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return NextResponse.json(
      { error: "刷新失败" },
      { status: 500 }
    );
  }
}
