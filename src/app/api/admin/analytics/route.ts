import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取时间范围
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

// 解析User-Agent
function parseUserAgent(userAgent: string): { browser: string; os: string; device: string } {
  const ua = userAgent.toLowerCase();
  
  // 浏览器检测
  let browser = "未知";
  if (ua.includes("edg/") || ua.includes("edge")) browser = "Edge";
  else if (ua.includes("chrome/") && !ua.includes("edg")) browser = "Chrome";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("opera") || ua.includes("opr/")) browser = "Opera";
  else if (ua.includes("msie") || ua.includes("trident")) browser = "IE";
  
  // 操作系统检测
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
  
  // 设备类型检测
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

    // 如果请求详细数据
    if (detail) {
      const offset = (page - 1) * limit;
      
      // 获取详细访问记录
      const { data: pageViews, error, count } = await supabase
        .from("page_views")
        .select("*", { count: "exact" })
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // 解析每条记录的User-Agent
      const detailedViews = pageViews?.map((view: PageViewRow) => {
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

      return NextResponse.json({
        period,
        pageViews: detailedViews,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      });
    }

    // 以下是聚合数据的逻辑
    // 1. 获取每日访问量
    const { data: dailyViews } = await supabase
      .from("page_views")
      .select("created_at, ip_address")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    // 处理每日数据
    const dailyStats: { date: string; views: number; uniqueVisitors: number }[] = [];
    const dateMap = new Map<string, { views: number; ips: Set<string> }>();
    
    // 初始化日期
    const currentStart = new Date(start);
    while (currentStart <= end) {
      const dateStr = currentStart.toISOString().split("T")[0];
      dateMap.set(dateStr, { views: 0, ips: new Set() });
      currentStart.setDate(currentStart.getDate() + 1);
    }

    // 统计数据
    if (dailyViews && Array.isArray(dailyViews)) {
      const typedDailyViews = dailyViews as Array<{
        created_at: string;
        ip_address?: string | null;
      }>;

      typedDailyViews.forEach((view) => {
        const createdAt = new Date(view.created_at);
        if (Number.isNaN(createdAt.getTime())) return;

        const dateStr = createdAt.toISOString().split("T")[0];
        const entry = dateMap.get(dateStr);
        if (entry) {
          entry.views++;
          if (view.ip_address) {
            entry.ips.add(view.ip_address);
          }
        }
      });
    }

    // 转换为数组格式
    dateMap.forEach((value, date) => {
      dailyStats.push({
        date,
        views: value.views,
        uniqueVisitors: value.ips.size,
      });
    });

    // 2. 获取总览统计
    const { count: totalViews } = await supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    // 3. 获取唯一访客数（按IP去重）
    const { data: uniqueIps } = await supabase
      .from("page_views")
      .select("ip_address")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
    
    const uniqueVisitors = new Set(uniqueIps?.map((v: { ip_address: string | null }) => v.ip_address) || []).size;

    // 4. 获取页面类型统计
    const { data: pageTypeStats } = await supabase
      .from("page_views")
      .select("page_type")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    const pageTypeCounts: Record<string, number> = {};
    pageTypeStats?.forEach((item: { page_type: string | null }) => {
      const type = item.page_type || "page";
      pageTypeCounts[type] = (pageTypeCounts[type] || 0) + 1;
    });

    // 5. 获取热门页面
    const { data: hotPages } = await supabase
      .from("page_views")
      .select("page_path")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .limit(1000);

    const pageCountMap = new Map<string, number>();
    hotPages?.forEach((item) => {
      pageCountMap.set(item.page_path, (pageCountMap.get(item.page_path) || 0) + 1);
    });

    const topPages = Array.from(pageCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    // 6. 获取访问趋势对比（与前一期相比）
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);

    const { count: prevTotalViews } = await supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", prevStart.toISOString())
      .lt("created_at", prevEnd.toISOString());

    const viewsGrowth = prevTotalViews ? ((totalViews || 0) - prevTotalViews) / prevTotalViews * 100 : 0;

    return NextResponse.json({
      period,
      summary: {
        totalViews: totalViews || 0,
        uniqueVisitors,
        avgViewsPerDay: Math.round((totalViews || 0) / dailyStats.length),
        viewsGrowth: viewsGrowth.toFixed(1),
      },
      dailyStats,
      pageTypeStats: pageTypeCounts,
      topPages,
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "获取统计数据失败" },
      { status: 500 }
    );
  }
}
