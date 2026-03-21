import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { directQuery } from "@/lib/direct-db";

const SEARCH_NORMALIZE_PATTERN = /[\s\p{P}\p{S}]+/gu;

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(SEARCH_NORMALIZE_PATTERN, "")
    .trim();
}

function buildSearchVariants(search: string): string[] {
  const normalized = normalizeSearchText(search);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  const rawChunks = search
    .split(/[\s\p{P}\p{S}]+/gu)
    .map((part) => normalizeSearchText(part))
    .filter(Boolean);

  rawChunks.forEach((chunk) => variants.add(chunk));

  const base = rawChunks.join("") || normalized;
  if (base.length >= 2) {
    for (let i = 0; i < base.length - 1; i += 1) {
      variants.add(base.slice(i, i + 2));
    }
  }

  if (base.length >= 3) {
    for (let i = 0; i < base.length - 2; i += 1) {
      variants.add(base.slice(i, i + 3));
    }
  }

  return Array.from(variants).filter((variant) => variant.length > 0).slice(0, 16);
}

function buildNormalizedTextSql(column: string): string {
  return `regexp_replace(lower(coalesce(${column}, '')), '[^0-9a-zA-Z一-龥]+', '', 'g')`;
}

function buildSearchScoreSql(variants: string[], startIndex: number): string {
  const parts: string[] = [];

  const normTitle = buildNormalizedTextSql("f.title");
  const normFileName = buildNormalizedTextSql("f.file_name");
  const normCourse = buildNormalizedTextSql("f.course");
  const normDescription = buildNormalizedTextSql("f.description");
  const normCategory = buildNormalizedTextSql("coalesce(c.name, '')");

  variants.forEach((variant, index) => {
    const paramIndex = startIndex + index;
    const lengthWeight = Math.max(6, Math.min(18, variant.length * 3));
    parts.push(`(
      CASE WHEN ${normTitle} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 6} ELSE 0 END +
      CASE WHEN ${normFileName} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 5} ELSE 0 END +
      CASE WHEN ${normCourse} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 3} ELSE 0 END +
      CASE WHEN ${normDescription} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 2} ELSE 0 END +
      CASE WHEN ${normCategory} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 3} ELSE 0 END
    )`);
  });

  return parts.length > 0 ? parts.join(" + ") : "0";
}

type AdminFileRow = Record<string, unknown> & {
  id: string;
  category_id: string;
  uploader_id: string;
  category_name: string | null;
  uploader_name: string | null;
  uploader_email: string | null;
  uploader_avatar: string | null;
  uploader_real_name: string | null;
  uploader_student_id: string | null;
  comment_count: number;
  relevance_score: number;
};

// 获取文件列表（管理员视图）
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const isFeatured = searchParams.get("is_featured");
    const isActive = searchParams.get("is_active");
    const aiStatus = searchParams.get("ai_status") || "";
    const sortBy = searchParams.get("sortBy") || "created_at";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const offset = (page - 1) * limit;
    const searchVariants = search ? buildSearchVariants(search) : [];
    const params: Array<string | number | boolean> = [];
    const where: string[] = [];
    let idx = 1;

    if (category) {
      where.push(`f.category_id = $${idx++}`);
      params.push(category);
    }

    if (isFeatured !== null && isFeatured !== "") {
      where.push(`f.is_featured = $${idx++}`);
      params.push(isFeatured === "true");
    }

    if (isActive !== null && isActive !== "") {
      where.push(`f.is_active = $${idx++}`);
      params.push(isActive === "true");
    }

    if (aiStatus === "reviewed") {
      where.push(`f.ai_classified_at is not null`);
    } else if (aiStatus === "pending") {
      where.push(`f.ai_classified_at is null`);
    }

    const searchStartIdx = idx;

    if (searchVariants.length > 0) {
      const normTitle = buildNormalizedTextSql("f.title");
      const normFileName = buildNormalizedTextSql("f.file_name");
      const normCourse = buildNormalizedTextSql("f.course");
      const normDescription = buildNormalizedTextSql("f.description");
      const normCategory = buildNormalizedTextSql("coalesce(c.name, '')");
      const searchClauses: string[] = [];

      for (const variant of searchVariants) {
        searchClauses.push(`(
          ${normTitle} LIKE '%' || $${idx} || '%' OR
          ${normFileName} LIKE '%' || $${idx} || '%' OR
          ${normCourse} LIKE '%' || $${idx} || '%' OR
          ${normDescription} LIKE '%' || $${idx} || '%' OR
          ${normCategory} LIKE '%' || $${idx} || '%'
        )`);
        params.push(variant);
        idx++;
      }

      where.push(`(${searchClauses.join(" OR ")})`);
    }

    const whereSql = where.length > 0 ? where.join(" and ") : "true";

    const sortMap: Record<string, string> = {
      created_at: "created_at",
      download_count: "download_count",
      average_rating: "average_rating::numeric",
      title: "title",
    };
    const sortColumn = sortMap[sortBy] || "created_at";
    const orderBy = `${sortColumn} ${sortOrder === "asc" ? "asc" : "desc"}`;

    const scoreSql = searchVariants.length > 0 ? buildSearchScoreSql(searchVariants, searchStartIdx) : "0";
    const dataParams = [...params, limit, offset];
    const [countRows, rows] = await Promise.all([
      directQuery<{ total: string }>(
        `
        select count(*)::int as total
        from files f
        left join categories c on c.id = f.category_id
        where ${whereSql}
        `,
        params
      ),
      directQuery<AdminFileRow>(
        `
        with ranked as (
          select
            f.*,
            c.name as category_name,
            p.name as uploader_name,
            p.email as uploader_email,
            p.avatar as uploader_avatar,
            p.real_name as uploader_real_name,
            p.student_id as uploader_student_id,
            coalesce(cc.comment_count, 0)::int as comment_count,
            ${scoreSql} as relevance_score
          from files f
          left join categories c on c.id = f.category_id
          left join profiles p on p.user_id = f.uploader_id
          left join (
            select file_id, count(*)::int as comment_count
            from comments
            where is_active = true
            group by file_id
          ) cc on cc.file_id = f.id
          where ${whereSql}
        )
        select *
        from ranked
        order by ${searchVariants.length > 0 ? "relevance_score desc, " : ""}${orderBy}
        limit $${idx} offset $${idx + 1}
        `,
        dataParams
      ),
    ]);
    const total = Number(countRows[0]?.total || 0);

    const filesWithRelations = rows.map((file) => ({
      ...file,
      categories: file.category_name ? { name: file.category_name } : null,
      profiles: file.uploader_name ? {
        name: file.uploader_name,
        email: file.uploader_email,
        avatar: file.uploader_avatar,
        real_name: file.uploader_real_name,
        student_id: file.uploader_student_id,
      } : null,
    }));

    return NextResponse.json({
      files: filesWithRelations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get admin files error:", error);
    return NextResponse.json({ error: "获取文件列表失败" }, { status: 500 });
  }
}

// 更新文件（设置精选等）
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

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限操作" }, { status: 403 });
    }

    const body = await request.json();
    const { fileId, updates } = body;

    if (!fileId || !updates) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 更新文件
    const { error: updateError } = await client
      .from("files")
      .update(updates)
      .eq("id", fileId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 如果设置为精选，给上传者奖励积分
    if (updates.is_featured === true) {
      const { data: file } = await client
        .from("files")
        .select("uploader_id")
        .eq("id", fileId)
        .single();

      if (file) {
        // 获取当前积分
        const { data: currentPoints } = await client
          .from("user_points")
          .select("balance, total_earned")
          .eq("user_id", file.uploader_id)
          .single();

        if (currentPoints) {
          await client
            .from("user_points")
            .update({
              balance: currentPoints.balance + 30,
              total_earned: currentPoints.total_earned + 30,
            })
            .eq("user_id", file.uploader_id);
        }

        // 记录交易
        await client
          .from("point_transactions")
          .insert({
            user_id: file.uploader_id,
            amount: 30,
            type: "featured",
            description: "资料被精选奖励",
            related_file_id: fileId,
          });
      }
    }

    return NextResponse.json({ success: true, message: "更新成功" });
  } catch (error) {
    console.error("Update file error:", error);
    return NextResponse.json({ error: "更新文件失败" }, { status: 500 });
  }
}

// 批量更新文件
export async function PATCH(request: NextRequest) {
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
      return NextResponse.json({ error: "只有管理员可以批量操作" }, { status: 403 });
    }

    const body = await request.json();
    const { fileIds, updates } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0 || !updates) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    // 批量更新
    const { error: updateError } = await client
      .from("files")
      .update(updates)
      .in("id", fileIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `成功更新 ${fileIds.length} 个文件` });
  } catch (error) {
    console.error("Batch update files error:", error);
    return NextResponse.json({ error: "批量更新失败" }, { status: 500 });
  }
}

// 删除文件（软删除）
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
      return NextResponse.json({ error: "只有管理员可以删除文件" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json({ error: "缺少文件ID" }, { status: 400 });
    }

    // 获取文件信息（用于删除对象存储中的文件）
    const { data: fileInfo } = await client
      .from("files")
      .select("file_key")
      .eq("id", fileId)
      .single();

    // 硬删除文件记录
    const { error: deleteError } = await client
      .from("files")
      .delete()
      .eq("id", fileId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 删除相关的评分和评论
    await Promise.all([
      client.from("ratings").delete().eq("file_id", fileId),
      client.from("comments").delete().eq("file_id", fileId),
    ]);

    // 尝试删除对象存储中的文件（忽略错误，因为可能已经被删除）
    if (fileInfo?.file_key) {
      try {
        const { deleteFile } = await import("@/lib/storage");
        await deleteFile(fileInfo.file_key);
      } catch (e) {
        console.warn("Failed to delete file from storage:", e);
      }
    }

    return NextResponse.json({ success: true, message: "文件已彻底删除" });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json({ error: "删除文件失败" }, { status: 500 });
  }
}
