import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 诊断 API - 检查用户状态
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({
        status: "error",
        message: "未登录，请先登录",
        hint: "点击登录按钮登录后再次尝试"
      });
    }

    const client = getSupabaseClient(token);
    
    // 1. 检查认证状态
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({
        status: "error",
        message: "令牌无效",
        error: authError?.message
      });
    }

    // 2. 检查 profiles 表中的记录
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // 3. 返回诊断信息
    return NextResponse.json({
      status: "ok",
      auth: {
        id: user.id,
        email: user.email,
        email_confirmed: user.email_confirmed_at,
      },
      profile: profile,
      profileError: profileError?.message,
      diagnosis: {
        isAuthenticated: !!user,
        hasProfile: !!profile,
        profileRole: profile?.role || "无",
        isAdmin: profile?.role === "admin",
        isVolunteer: profile?.role === "volunteer" || profile?.role === "admin",
      },
      fix: profile?.role !== "admin" 
        ? "请在数据库 SQL 客户端中执行: UPDATE profiles SET role = 'admin' WHERE email = '" + user.email + "';"
        : "角色设置正确，请退出登录后重新登录"
    });
  } catch (error) {
    console.error("Diagnose error:", error);
    return NextResponse.json({
      status: "error",
      message: "诊断失败",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
