import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { POINTS_CONFIG } from "@/types/points";

// 获取用户积分
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const { searchParams } = new URL(request.url);
    const lightweight = searchParams.get("lightweight") === "true";

    if (!token) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      );
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "无效的令牌" },
        { status: 401 }
      );
    }

    // 获取用户积分
    let { data: points, error } = await client
      .from("user_points")
      .select("balance, total_earned, total_spent")
      .eq("user_id", user.id)
      .maybeSingle();

    // 如果没有积分记录，创建一个
    if (!points && !error) {
      const { data: newPoints, error: createError } = await client
        .from("user_points")
        .insert({
          user_id: user.id,
          balance: POINTS_CONFIG.REGISTER_BONUS,
          total_earned: POINTS_CONFIG.REGISTER_BONUS,
          total_spent: 0,
        })
        .select("balance, total_earned, total_spent")
        .single();

      if (createError) {
        return NextResponse.json(
          { error: createError.message },
          { status: 400 }
        );
      }

      // 异步记录注册奖励（不阻塞响应）
      void client.from("point_transactions").insert({
        user_id: user.id,
        amount: POINTS_CONFIG.REGISTER_BONUS,
        type: "register_bonus",
        description: "新用户注册奖励",
      });

      points = newPoints;
    }

    // 轻量级查询只返回积分信息
    if (lightweight) {
      return NextResponse.json({
        points: points || { balance: POINTS_CONFIG.REGISTER_BONUS, total_earned: POINTS_CONFIG.REGISTER_BONUS, total_spent: 0 },
      });
    }

    // 获取最近的积分记录
    const { data: transactions } = await client
      .from("point_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      points,
      transactions: transactions || [],
    });
  } catch (error) {
    console.error("Get points error:", error);
    return NextResponse.json(
      { error: "获取积分失败" },
      { status: 500 }
    );
  }
}

// 管理员调整积分
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      );
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "无效的令牌" },
        { status: 401 }
      );
    }

    // 检查是否是管理员
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || !["admin", "volunteer"].includes(profile.role)) {
      return NextResponse.json(
        { error: "没有权限" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, amount, description } = body;

    if (!userId || !amount || !description) {
      return NextResponse.json(
        { error: "参数错误" },
        { status: 400 }
      );
    }

    // 更新积分
    const { error: updateError } = await client.rpc("adjust_user_points", {
      p_user_id: userId,
      p_amount: amount,
      p_type: "admin_adjust",
      p_description: description,
    });

    if (updateError) {
      // 如果存储过程不存在，手动处理
      const { data: currentPoints } = await client
        .from("user_points")
        .select("balance, total_earned, total_spent")
        .eq("user_id", userId)
        .single();

      if (!currentPoints) {
        return NextResponse.json(
          { error: "用户积分记录不存在" },
          { status: 400 }
        );
      }

      const newBalance = currentPoints.balance + amount;

      await client
        .from("user_points")
        .update({
          balance: newBalance,
          total_earned: amount > 0 ? currentPoints.total_earned + amount : currentPoints.total_earned,
          total_spent: amount < 0 ? currentPoints.total_spent + Math.abs(amount) : currentPoints.total_spent,
        })
        .eq("user_id", userId);

      await client.from("point_transactions").insert({
        user_id: userId,
        amount,
        type: "admin_adjust",
        description,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Adjust points error:", error);
    return NextResponse.json(
      { error: "调整积分失败" },
      { status: 500 }
    );
  }
}
