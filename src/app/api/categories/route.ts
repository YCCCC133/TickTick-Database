import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { cache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";
import { directQuery } from "@/lib/direct-db";

/**
 * 获取所有分类（带缓存）
 */
export async function GET(request?: NextRequest) {
  try {
    const includeCounts = request?.nextUrl.searchParams.get("include_counts") === "true";

    // 尝试从缓存获取
    if (!includeCounts) {
      const cachedCategories = cache.get<Array<Record<string, unknown>>>(CACHE_KEYS.CATEGORIES);
      
      if (cachedCategories) {
        return NextResponse.json({ categories: cachedCategories, cached: true });
      }
    }

    const data = includeCounts
      ? await directQuery(
          `
          select
            c.*,
            coalesce(fc.file_count, 0)::int as file_count
          from categories c
          left join (
            select category_id, count(*)::int as file_count
            from files
            group by category_id
          ) fc on fc.category_id = c.id
          where c.is_active = true
          order by c."order" asc
          `
        )
      : await directQuery(
          'select * from categories where is_active = true order by "order" asc'
        );

    if (!data) {
      return NextResponse.json(
        { error: "获取分类失败" },
        { status: 500 }
      );
    }

    // 缓存分类列表（1小时，因为分类变化不频繁）
    if (data && !includeCounts) {
      cache.set(CACHE_KEYS.CATEGORIES, data, CACHE_TTL.LONG);
    }

    return NextResponse.json({ categories: data, cached: false });
  } catch (error) {
    console.error("Get categories error:", error);
    return NextResponse.json(
      { error: "获取分类失败" },
      { status: 500 }
    );
  }
}

/**
 * 创建分类（清除缓存）
 */
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

    // 检查权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "volunteer")) {
      return NextResponse.json(
        { error: "权限不足" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, slug, description, icon, color, parentId, order } = body;

    const { data, error } = await client
      .from("categories")
      .insert({
        name,
        slug,
        description,
        icon,
        color,
        parent_id: parentId,
        order: order || 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // 清除分类缓存
    cache.delete(CACHE_KEYS.CATEGORIES);
    cache.delete("files:home"); // 同时清除首页缓存

    return NextResponse.json({
      success: true,
      category: data,
    });
  } catch (error) {
    console.error("Create category error:", error);
    return NextResponse.json(
      { error: "创建分类失败" },
      { status: 500 }
    );
  }
}

/**
 * 更新分类（清除缓存）
 * 支持两种模式：
 * 1. 批量更新排序: { orders: [{ id, order }, ...] }
 * 2. 更新单个分类: { id, name, slug, description, ... }
 */
export async function PUT(request: NextRequest) {
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

    // 检查权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "volunteer")) {
      return NextResponse.json(
        { error: "权限不足" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // 模式1: 批量更新排序
    if (body.orders && Array.isArray(body.orders)) {
      const { orders } = body;
      let successCount = 0;
      let failCount = 0;

      for (const item of orders) {
        try {
          const { error: updateError } = await client
            .from("categories")
            .update({ order: item.order })
            .eq("id", item.id);

          if (updateError) {
            console.error(`Failed to update category ${item.id}:`, updateError);
            failCount++;
          } else {
            successCount++;
          }
        } catch (e) {
          console.error(`Error updating category ${item.id}:`, e);
          failCount++;
        }
      }

      cache.delete(CACHE_KEYS.CATEGORIES);
      cache.delete("files:home");

      return NextResponse.json({
        success: true,
        message: `成功更新 ${successCount} 个分类排序${failCount > 0 ? `，失败 ${failCount} 个` : ""}`,
        stats: { success: successCount, failed: failCount },
      });
    }

    // 模式2: 更新单个分类
    const { id, name, slug, description, icon, color, order } = body;

    if (!id) {
      return NextResponse.json(
        { error: "缺少分类ID" },
        { status: 400 }
      );
    }

    const updateData: Record<string, string | number | boolean | null> = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (order !== undefined) updateData.order = order;

    const { data, error } = await client
      .from("categories")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // 清除缓存
    cache.delete(CACHE_KEYS.CATEGORIES);
    cache.delete("files:home");

    return NextResponse.json({
      success: true,
      category: data,
    });
  } catch (error) {
    console.error("Update category error:", error);
    return NextResponse.json(
      { error: "更新分类失败" },
      { status: 500 }
    );
  }
}

/**
 * 删除分类（软删除，清除缓存）
 */
export async function DELETE(request: NextRequest) {
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

    // 检查权限 - 只有管理员可以删除分类
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "只有管理员可以删除分类" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "缺少分类ID" },
        { status: 400 }
      );
    }

    // 检查分类下是否有文件
    const { count } = await client
      .from("files")
      .select("*", { count: "exact", head: true })
      .eq("category_id", id)
      .eq("is_active", true);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `该分类下有 ${count} 个文件，无法删除。请先移动或删除这些文件。` },
        { status: 400 }
      );
    }

    // 软删除
    const { error: deleteError } = await client
      .from("categories")
      .update({ is_active: false })
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 400 }
      );
    }

    // 清除缓存
    cache.delete(CACHE_KEYS.CATEGORIES);
    cache.delete("files:home");

    return NextResponse.json({
      success: true,
      message: "分类已删除",
    });
  } catch (error) {
    console.error("Delete category error:", error);
    return NextResponse.json(
      { error: "删除分类失败" },
      { status: 500 }
    );
  }
}
