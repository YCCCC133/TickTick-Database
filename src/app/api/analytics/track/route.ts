import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { pagePath, pageType, referrer, sessionId, metadata } = body;

    // 获取客户端信息
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                      request.headers.get("x-real-ip") || 
                      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // 插入访问记录
    const { error } = await supabase.from("page_views").insert({
      page_path: pagePath,
      page_type: pageType || "page",
      referrer: referrer || null,
      user_agent: userAgent,
      ip_address: ipAddress,
      session_id: sessionId || null,
      metadata: metadata || {},
    });

    if (error) {
      console.error("Failed to record page view:", error);
      // 不影响用户体验，静默失败
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Page view tracking error:", error);
    return NextResponse.json({ success: true }); // 静默失败
  }
}
