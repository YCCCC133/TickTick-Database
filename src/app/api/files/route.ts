import { NextRequest, NextResponse } from "next/server";
import { cache, CACHE_TTL } from "@/lib/cache";
import { directQuery } from "@/lib/direct-db";
import { getPublicOrigin } from "@/lib/public-origin";

const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};

type FilesHomeResponse = {
  files: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type FilesHomeRow = {
  id: string;
  preview_url: string | null;
  category_name: string | null;
  uploader_name: string | null;
  uploader_email: string | null;
  uploader_avatar: string | null;
  uploader_real_name: string | null;
  uploader_student_id: string | null;
  total_count: number;
  [key: string]: unknown;
};

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

/**
 * 转换preview_url为当前站点的代理URL
 */
function convertPreviewUrl(previewUrl: string | null, fileId: string, baseUrl: string): string | null {
  if (!previewUrl) return null;
  
  const proxyPath = previewUrl.match(/\/api\/files\/(?:preview|avatar)\/.*$/)?.[0];
  if (proxyPath) {
    return `${baseUrl}${proxyPath}`;
  }
  
  // 如果是COS直接URL，转换为代理URL
  if (previewUrl.includes('.cos.')) {
    return `${baseUrl}/api/files/${fileId}/proxy`;
  }
  
  return previewUrl;
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = getPublicOrigin(request);
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const semester = searchParams.get("semester");
    const isFeatured = searchParams.get("is_featured");
    const sortBy = searchParams.get("sortBy") || "created_at";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offsetParam = searchParams.get("offset");
    const offset = offsetParam !== null ? parseInt(offsetParam) || 0 : (page - 1) * limit;
    const resolvedPage = offsetParam !== null ? Math.floor(offset / limit) + 1 : page;
    const searchVariants = search ? buildSearchVariants(search) : [];

    // 检查是否有缓存参数（强制刷新）
    const noCache = searchParams.get("_t");
    const cacheKey = "files:home";

    // 尝试从缓存获取（仅对无搜索条件的首页请求缓存）
    if (!noCache && !category && !search && !semester && !isFeatured && resolvedPage === 1 && sortBy === "comprehensive") {
      const cached = cache.get<FilesHomeResponse>(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, cached: true }, { headers: PUBLIC_CACHE_HEADERS });
      }
    }

    const params: Array<string | number | boolean> = [];
    const where: string[] = ["f.is_active = true"];
    let idx = 1;

    if (category) {
      where.push(`f.category_id = $${idx++}`);
      params.push(category);
    }

    if (semester) {
      where.push(`f.semester = $${idx++}`);
      params.push(semester);
    }

    if (isFeatured !== null && isFeatured !== "") {
      where.push(`f.is_featured = $${idx++}`);
      params.push(isFeatured === "true");
    }

    const searchStartIndex = idx;
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

    let orderBy = 'created_at desc';
    if (sortBy === "download_count") {
      orderBy = "download_count desc";
    } else if (sortBy === "average_rating") {
      orderBy = "average_rating::numeric desc, rating_count desc";
    } else if (sortBy === "comprehensive") {
      orderBy = "download_count desc, average_rating::numeric desc";
    }

    const scoreSql = searchVariants.length > 0 ? buildSearchScoreSql(searchVariants, searchStartIndex) : "0";
    const dataParams = [...params, limit, offset];
    const rankingSelect = `${scoreSql} as relevance_score`;
    const rows = await directQuery<FilesHomeRow>(
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
          ${rankingSelect},
          count(*) over()::int as total_count
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
    );
    const total = Number(rows[0]?.total_count || 0);

    const filesWithRelations = rows.map((file) => ({
      ...file,
      preview_url: convertPreviewUrl(file.preview_url, file.id, baseUrl),
      categories: file.category_name ? { name: file.category_name } : null,
      profiles: file.uploader_name ? {
        name: file.uploader_name,
        email: file.uploader_email,
        avatar: file.uploader_avatar,
        real_name: file.uploader_real_name,
        student_id: file.uploader_student_id,
      } : null,
    }));

    const result = {
      files: filesWithRelations,
      pagination: {
        page: resolvedPage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // 缓存首页数据（1分钟）
    if (!category && !search && !semester && !isFeatured && resolvedPage === 1 && sortBy === "comprehensive") {
      cache.set("files:home", result, CACHE_TTL.SHORT);
    }

    return NextResponse.json(result, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error("Get files error:", error);
    return NextResponse.json(
      { error: "获取文件列表失败" },
      { status: 500 }
    );
  }
}
