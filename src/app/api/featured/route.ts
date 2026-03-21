import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { cache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";
import { directQuery } from "@/lib/direct-db";

// 获取精选文件列表（从files表中获取is_featured=true的文件）
export async function GET(request: NextRequest) {
  try {
    // 尝试从缓存获取
    const cachedFeatured = cache.get<any[]>(CACHE_KEYS.FEATURED_FILES);
    if (cachedFeatured) {
      return NextResponse.json({ featured: cachedFeatured, cached: true });
    }

    const featuredFiles = await directQuery<any>(
      `
      select
        f.*,
        c.name as category_name,
        p.name as uploader_name,
        p.email as uploader_email,
        p.avatar as uploader_avatar
      from files f
      left join categories c on c.id = f.category_id
      left join profiles p on p.user_id = f.uploader_id
      where f.is_featured = true and f.is_active = true
      order by f.created_at desc
      limit 20
      `
    ).then(rows => rows.map(file => ({
      ...file,
      categories: file.category_name ? { name: file.category_name } : null,
      profiles: file.uploader_name ? {
        name: file.uploader_name,
        email: file.uploader_email,
        avatar: file.uploader_avatar,
      } : null,
    })));

    // 缓存精选文件列表（5分钟）
    cache.set(CACHE_KEYS.FEATURED_FILES, featuredFiles, CACHE_TTL.MEDIUM);

    return NextResponse.json({ featured: featuredFiles, cached: false });
  } catch (error) {
    console.error("Get featured files error:", error);
    return NextResponse.json(
      { error: "获取精选文件失败" },
      { status: 500 }
    );
  }
}

// 添加精选文件（直接更新files表的is_featured字段）
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
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: "缺少文件ID" },
        { status: 400 }
      );
    }

    // 获取文件信息
    const { data: file, error: fileError } = await client
      .from("files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: "文件不存在" },
        { status: 404 }
      );
    }

    if (file.is_featured) {
      return NextResponse.json(
        { error: "该文件已被精选" },
        { status: 400 }
      );
    }

    // 更新文件精选标记
    const { error } = await client
      .from("files")
      .update({ is_featured: true })
      .eq("id", fileId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // 奖励精选积分
    const { rewardFeaturedPoints } = await import("@/lib/points");
    await rewardFeaturedPoints(file.uploader_id, fileId);

    // 清除精选缓存
    cache.delete(CACHE_KEYS.FEATURED_FILES);

    return NextResponse.json({
      success: true,
      fileId,
    });
  } catch (error) {
    console.error("Add featured file error:", error);
    return NextResponse.json(
      { error: "添加精选失败" },
      { status: 500 }
    );
  }
}

// 取消精选（直接更新files表的is_featured字段）
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

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        { error: "缺少文件ID" },
        { status: 400 }
      );
    }

    // 更新文件精选标记
    const { error } = await client
      .from("files")
      .update({ is_featured: false })
      .eq("id", fileId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // 清除精选缓存
    cache.delete(CACHE_KEYS.FEATURED_FILES);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove featured file error:", error);
    return NextResponse.json(
      { error: "取消精选失败" },
      { status: 500 }
    );
  }
}
