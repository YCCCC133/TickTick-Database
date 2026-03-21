import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { directQuery } from "@/lib/direct-db";

type AdminStatsResponse = {
  totalFiles: number;
  totalDownloads: number;
  totalRatings: number;
  totalUsers: number;
  categoryCounts: Record<string, number>;
  generatedAt: string;
};

async function authorize(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return { error: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  }

  const client = getSupabaseClient(token);
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user) {
    return { error: NextResponse.json({ error: "无效的令牌" }, { status: 401 }) };
  }

  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "volunteer") {
    return { error: NextResponse.json({ error: "无权限访问" }, { status: 403 }) };
  }

  return { client };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const [fileStats, userStats, categoryStats] = await Promise.all([
      directQuery<{ total_files: string; total_downloads: string; total_ratings: string }>(`
        select
          count(*)::int as total_files,
          coalesce(sum(download_count), 0)::int as total_downloads,
          coalesce(sum(rating_count), 0)::int as total_ratings
        from files
      `),
      directQuery<{ total_users: string }>(`
        select count(*)::int as total_users
        from profiles
      `),
      directQuery<{ category_id: string | null; file_count: string }>(`
        select
          category_id,
          count(*)::int as file_count
        from files
        group by category_id
      `),
    ]);

    const categoryCounts: Record<string, number> = {};
    categoryStats.forEach((row) => {
      if (row.category_id) {
        categoryCounts[row.category_id] = Number(row.file_count || 0);
      }
    });

    const result: AdminStatsResponse = {
      totalFiles: Number(fileStats[0]?.total_files || 0),
      totalDownloads: Number(fileStats[0]?.total_downloads || 0),
      totalRatings: Number(fileStats[0]?.total_ratings || 0),
      totalUsers: Number(userStats[0]?.total_users || 0),
      categoryCounts,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get admin stats error:", error);
    return NextResponse.json({ error: "获取统计数据失败" }, { status: 500 });
  }
}
