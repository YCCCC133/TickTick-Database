"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// 生成或获取session ID
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  
  try {
    const storageKey = "analytics_session_id";
    const sessionTimestampKey = "analytics_session_timestamp";
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30分钟超时
    
    const existingId = sessionStorage.getItem(storageKey);
    const lastTimestamp = sessionStorage.getItem(sessionTimestampKey);
    
    // 检查是否超时
    if (existingId && lastTimestamp) {
      const elapsed = Date.now() - parseInt(lastTimestamp);
      if (elapsed < SESSION_TIMEOUT) {
        sessionStorage.setItem(sessionTimestampKey, Date.now().toString());
        return existingId;
      }
    }
    
    // 生成新的session ID
    const newId = crypto.randomUUID();
    sessionStorage.setItem(storageKey, newId);
    sessionStorage.setItem(sessionTimestampKey, Date.now().toString());
    return newId;
  } catch {
    return crypto.randomUUID();
  }
}

// 判断页面类型
function getPageType(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname === "/admin") return "admin";
  if (pathname.startsWith("/admin/")) return "admin";
  if (pathname.startsWith("/files/") && pathname.includes("/download")) return "download";
  if (pathname.startsWith("/files/")) return "file_detail";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/rankings")) return "rankings";
  if (pathname.startsWith("/search")) return "search";
  return "page";
}

export function useAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTracked = useRef<{ key: string; timestamp: number } | null>(null);
  const search = searchParams?.toString();
  const pageKey = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    // 仅在客户端运行
    if (typeof window === "undefined") return;

    const now = Date.now();
    const duplicateWindow = 1500;

    if (lastTracked.current?.key === pageKey && now - lastTracked.current.timestamp < duplicateWindow) {
      return;
    }

    // 延迟发送，不阻塞页面渲染
    const trackTimer = setTimeout(() => {
      try {
        const sessionId = getSessionId();
        const pageType = getPageType(pathname);
        const payload = {
          pagePath: pageKey,
          pageType,
          referrer: document.referrer || null,
          sessionId,
          metadata: {
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            language: navigator.language,
          },
        };

        lastTracked.current = { key: pageKey, timestamp: Date.now() };

        const body = JSON.stringify(payload);
        const beaconBlob = new Blob([body], { type: "application/json" });

        if (navigator.sendBeacon) {
          const sent = navigator.sendBeacon("/api/analytics/track", beaconBlob);
          if (sent) return;
        }

        fetch("/api/analytics/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body,
          keepalive: true,
        }).catch(() => {
          // 静默失败，不影响用户体验
        });
      } catch {
        // 静默失败
      }
    }, 100);

    return () => clearTimeout(trackTimer);
  }, [pathname, pageKey]);

  // 手动追踪事件
  const trackEvent = async (eventName: string, metadata?: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    
    try {
      const sessionId = getSessionId();
      const token = localStorage?.getItem("token") || null;

      await fetch("/api/analytics/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pagePath: pageKey,
          pageType: "event",
          sessionId,
          metadata: {
            eventName,
            ...metadata,
          },
        }),
      }).catch(() => {});
    } catch {
      // 静默失败
    }
  };

  return { trackEvent };
}
