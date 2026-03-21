import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 赠送积分
export async function POST(request: NextRequest) {
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

    // 检查管理员权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限操作" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, amount, reason } = body;

    if (!userId || !amount || amount <= 0) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    // 获取用户当前积分
    const { data: currentPoints, error: fetchError } = await client
      .from("user_points")
      .select("balance, total_earned")
      .eq("user_id", userId)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // 更新或创建积分记录
    if (currentPoints) {
      const { error: updateError } = await client
        .from("user_points")
        .update({
          balance: currentPoints.balance + amount,
          total_earned: currentPoints.total_earned + amount,
        })
        .eq("user_id", userId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      const { error: createError } = await client
        .from("user_points")
        .insert({
          user_id: userId,
          balance: amount,
          total_earned: amount,
          total_spent: 0,
        });

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
    }

    // 记录交易
    const { error: transactionError } = await client
      .from("point_transactions")
      .insert({
        user_id: userId,
        amount,
        type: "admin_adjust",
        description: reason || `管理员赠送 ${amount} 积分`,
      });

    if (transactionError) {
      console.error("Failed to record transaction:", transactionError);
    }

    return NextResponse.json({ 
      success: true, 
      message: `成功赠送 ${amount} 积分`,
      newBalance: currentPoints ? currentPoints.balance + amount : amount,
    });
  } catch (error) {
    console.error("Gift points error:", error);
    return NextResponse.json({ error: "赠送积分失败" }, { status: 500 });
  }
}

// 批量赠送积分
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

    // 检查管理员权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "只有管理员可以批量赠送积分" }, { status: 403 });
    }

    const body = await request.json();
    const { userIds, amount, reason } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0 || !amount || amount <= 0) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    let successCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      try {
        // 获取用户当前积分
        const { data: currentPoints } = await client
          .from("user_points")
          .select("balance, total_earned")
          .eq("user_id", userId)
          .single();

        // 更新或创建积分记录
        if (currentPoints) {
          await client
            .from("user_points")
            .update({
              balance: currentPoints.balance + amount,
              total_earned: currentPoints.total_earned + amount,
            })
            .eq("user_id", userId);
        } else {
          await client
            .from("user_points")
            .insert({
              user_id: userId,
              balance: amount,
              total_earned: amount,
              total_spent: 0,
            });
        }

        // 记录交易
        await client
          .from("point_transactions")
          .insert({
            user_id: userId,
            amount,
            type: "admin_adjust",
            description: reason || `管理员批量赠送 ${amount} 积分`,
          });

        successCount++;
      } catch {
        failCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功赠送 ${successCount} 人，失败 ${failCount} 人`,
      successCount,
      failCount,
    });
  } catch (error) {
    console.error("Batch gift points error:", error);
    return NextResponse.json({ error: "批量赠送积分失败" }, { status: 500 });
  }
}
