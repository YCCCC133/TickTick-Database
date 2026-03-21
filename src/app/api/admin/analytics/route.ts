import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { cache } from "@/lib/cache";

const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
};

function getDateRange(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "7days":
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "30days":
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case "90days":
      start.setDate(start.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

function parseUserAgent(userAgent: string): { browser: string; os: string; device: string } {
  const ua = userAgent.toLowerCase();

  let browser = "未知";
  if (ua.includes("edg/") || ua.includes("edge")) browser = "Edge";
  else if (ua.includes("chrome/") && !ua.includes("edg")) browser = "Chrome";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("opera") || ua.includes("opr/")) browser = "Opera";
  else if (ua.includes("msie") || ua.includes("trident")) browser = "IE";

  let os = "未知";
  if (ua.includes("windows nt 10")) os = "Windows 10";
  else if (ua.includes("windows nt 6.3")) os = "Windows 8.1";
  else if (ua.includes("windows nt 6.2")) os = "Windows 8";
  else if (ua.includes("windows nt 6.1")) os = "Windows 7";
  else if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os x")) os = "macOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
  else if (ua.includes("linux")) os = "Linux";

  let device = "桌面端";
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) device = "移动端";
  else if (ua.includes("tablet") || ua.includes("ipad")) device = "平板";

  return { browser, os, device };
}

type PageViewRow = {
  id: string;
  page_path: string;
  page_type: string;
  referrer: string | null;
  ip_address: string | null;
  session_id: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "7days";
    const detail = searchParams.get("detail") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "1000");
    const { start, end } = getDateRange(period);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const cacheKey = `admin:analytics:${period}`;

    if (detail) {
      const offset = (page - 1) * limit;
      const { data: pageViews, error, count } = await supabase
        .from("page_views")
        .select("*", { count: "exact" })
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const detailedViews =
        pageViews?.map((view: PageViewRow) => {
          const { browser, os, device } = parseUserAgent(view.user_agent || "");
          return {
            id: view.id,
            pagePath: view.page_path,
            pageType: view.page_type,
            referrer: view.referrer,
            ipAddress: view.ip_address,
            sessionId: view.session_id,
            userAgent: view.user_agent,
            browser,
            os,
            device,
            metadata: view.metadata,
            createdAt: view.created_at,
          };
        }) || [];

      return NextResponse.json(
        {
          period,
          pageViews: detailedViews,
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
          },
          dateRange: {
            start: startIso,
            end: endIso,
          },
        },
        { headers: CACHE_HEADERS }
      );
    }

    const cached = cache.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true }, { headers: CACHE_HEADERS });
    }

    const [
      dailyViewsResult,
      totalViewsResult,
      uniqueIpsResult,
      pageTypeStatsResult,
      hotPagesResult,
      prevTotalViewsResult,
    ] = await Promise.all([
      supabase.from("page_views").select("created_at, ip_address").gte("created_at", startIso).lte("created_at", endIso),
      supabase.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", startIso).lte("created_at", endIso),
      supabase.from("page_views").select("ip_address").gte("created_at", startIso).lte("created_at", endIso),
      supabase.from("page_views").select("page_type").gte("created_at", startIso).lte("created_at", endIso),
      supabase.from("page_views").select("page_path").gte("created_at", startIso).lte("created_at", endIso).limit(1000),
      (() => {
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const prevEnd = new Date(start);
        return supabase.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", prevStart.toISOString()).lt("created_at", prevEnd.toISOString());
      })(),
    ]);

    const dailyViews = dailyViewsResult.data;
    const totalViews = totalViewsResult.count || 0;
    const uniqueIps = uniqueIpsResult.data;
    const pageTypeStats = pageTypeStatsResult.data;
    const hotPages = hotPagesResult.data;
    const prevTotalViews = prevTotalViewsResult.count || 0;

    const dateMap = new Map<string, { views: number; ips: Set<string> }>();
    const cursor = new Date(start);
    while (cursor <= end) {
      dateMap.set(cursor.toISOString().split("T")[0], { views: 0, ips: new Set() });
      cursor.setDate(cursor.getDate() + 1);
    }

    if (dailyViews && Array.isArray(dailyViews)) {
      (dailyViews as Array<{ created_at: string; ip_address?: string | null }>).forEach((view) => {
        const createdAt = new Date(view.created_at);
        if (Number.isNaN(createdAt.getTime())) return;
        const dateStr = createdAt.toISOString().split("T")[0];
        const entry = dateMap.get(dateStr);
        if (!entry) return;
        entry.views++;
        if (view.ip_address) entry.ips.add(view.ip_address);
      });
    }

    const dailyStats = Array.from(dateMap.entries()).map(([date, value]) => ({
      date,
      views: value.views,
      uniqueVisitors: value.ips.size,
    }));

    const uniqueVisitors = new Set(uniqueIps?.map((v: { ip_address: string | null }) => v.ip_address) || []).size;
    const pageTypeCounts: Record<string, number> = {};
    pageTypeStats?.forEach((item: { page_type: string | null }) => {
      const type = item.page_type || "page";
      pageTypeCounts[type] = (pageTypeCounts[type] || 0) + 1;
    });

    const pageCountMap = new Map<string, number>();
    hotPages?.forEach((item: { page_path: string }) => {
      pageCountMap.set(item.page_path, (pageCountMap.get(item.page_path) || 0) + 1);
    });

    const topPages = Array.from(pageCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    const viewsGrowth = prevTotalViews ? ((totalViews - prevTotalViews) / prevTotalViews) * 100 : 0;

    const result = {
      period,
      summary: {
        totalViews,
        uniqueVisitors,
        avgViewsPerDay: Math.round(totalViews / Math.max(1, dailyStats.length)),
        viewsGrowth: viewsGrowth.toFixed(1),
      },
      dailyStats,
      pageTypeStats: pageTypeCounts,
      topPages,
      dateRange: {
        start: startIso,
        end: endIso,
      },
    };

    cache.set(cacheKey, result, 30);

    return NextResponse.json(result, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "获取统计数据失败" },
      { status: 500 }
    );
  }
}
