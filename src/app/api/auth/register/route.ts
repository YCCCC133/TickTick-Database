import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    // 验证必填字段
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "邮箱、密码和昵称不能为空" },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "邮箱格式不正确" },
        { status: 400 }
      );
    }

    // 验证密码强度
    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码长度至少6位" },
        { status: 400 }
      );
    }

    // 验证昵称长度
    if (name.length < 1 || name.length > 20) {
      return NextResponse.json(
        { error: "昵称长度应为1-20个字符" },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 注册用户
    const { data, error } = await client.auth.signUp({
      email,
      password,
    });

    if (error) {
      // 处理认证错误
      if (error.message.includes("already registered")) {
        return NextResponse.json(
          { error: "该邮箱已被注册" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // 创建用户资料
    if (data.user) {
      const { error: profileError } = await client
        .from("profiles")
        .insert({
          user_id: data.user.id,
          email: email,
          name: name, // 昵称
          role: "guest", // 默认为访客
        });

      if (profileError) {
        console.error("Profile creation error:", profileError);
        // 尝试删除已创建的认证用户
        await client.auth.admin.deleteUser(data.user.id);
        return NextResponse.json(
          { error: "创建用户资料失败，请重试" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      user: data.user,
      message: "注册成功，请查收验证邮件",
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 }
    );
  }
}
