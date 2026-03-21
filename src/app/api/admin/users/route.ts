import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

type UserProfileRow = {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  real_name: string | null;
  student_id: string | null;
  phone: string | null;
  school: string | null;
  is_verified: boolean;
  role: string;
  is_active: boolean;
  avatar: string | null;
  created_at: string;
  updated_at: string;
};

type UserPointRow = {
  user_id: string;
  balance: number;
};

// 获取用户列表
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

    // 检查管理员权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限访问" }, { status: 403 });
    }

    // 获取分页参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";

    // 构建查询
    let query = client
      .from("profiles")
      .select(`
        id,
        user_id,
        email,
        name,
        real_name,
        student_id,
        phone,
        school,
        is_verified,
        role,
        is_active,
        avatar,
        created_at,
        updated_at
      `, { count: "exact" });

    // 搜索条件
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,real_name.ilike.%${search}%,student_id.ilike.%${search}%`);
    }

    // 角色筛选
    if (role) {
      query = query.eq("role", role);
    }

    // 分页
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: users, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 获取每个用户的积分 - 使用 user_id 关联
    const userIds = ((users || []) as UserProfileRow[]).map((u) => u.user_id).filter(Boolean);
    const { data: pointsData } = await client
      .from("user_points")
      .select("user_id, balance")
      .in("user_id", userIds);

    const pointsMap = new Map<string, number>(
      (pointsData || []).map((p: UserPointRow) => [p.user_id, p.balance])
    );

    // 组合数据 - 使用 user_id 获取积分
    const usersWithPoints = (users || []).map((user: UserProfileRow) => ({
      ...user,
      points: pointsMap.get(user.user_id) || 0,
    }));

    console.log("Admin users API response:", { 
      usersCount: usersWithPoints?.length, 
      totalCount: count,
      users: usersWithPoints 
    });

    return NextResponse.json({
      users: usersWithPoints,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json({ error: "获取用户列表失败" }, { status: 500 });
  }
}

// 更新用户信息
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
      return NextResponse.json({ error: "只有管理员可以执行此操作" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, updates } = body;

    if (!userId || !updates) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 更新用户信息
    const { error: updateError } = await client
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "更新成功" });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "更新用户失败" }, { status: 500 });
  }
}

// 删除用户（软删除）
export async function DELETE(request: NextRequest) {
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
      return NextResponse.json({ error: "只有管理员可以执行此操作" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });
    }

    // 不能删除自己
    if (userId === user.id) {
      return NextResponse.json({ error: "不能删除自己的账号" }, { status: 400 });
    }

    // 软删除（设置 is_active = false）
    const { error: deleteError } = await client
      .from("profiles")
      .update({ is_active: false })
      .eq("id", userId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "用户已禁用" });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "删除用户失败" }, { status: 500 });
  }
}
