"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { User, Profile } from "@/types";

interface UserPoints {
  balance: number;
  total_earned: number;
  total_spent: number;
}

interface SessionData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // 过期时间戳（秒）
  user: User;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  token: string | null;
  points: UserPoints | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ isAdmin: boolean; isVolunteer: boolean }>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshPoints: () => Promise<void>;
  isAdmin: boolean;
  isVolunteer: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 积分缓存时间（毫秒）
const POINTS_CACHE_TIME = 5000;
// Token 过期前提前刷新的时间（5分钟）
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;

// 本地存储键名
const STORAGE_KEYS = {
  SESSION: "auth_session",
  PROFILE: "auth_profile",
  POINTS: "auth_points",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 积分刷新防抖
  const lastPointsRefresh = useRef<number>(0);
  const pointsRefreshTimer = useRef<NodeJS.Timeout | null>(null);
  // Token 刷新定时器
  const tokenRefreshTimer = useRef<NodeJS.Timeout | null>(null);

  // 初始化：从本地存储恢复会话
  useEffect(() => {
    const initAuth = async () => {
      try {
        // 从 localStorage 读取会话数据
        const sessionJson = localStorage.getItem(STORAGE_KEYS.SESSION);
        
        if (!sessionJson) {
          setLoading(false);
          return;
        }

        const session: SessionData = JSON.parse(sessionJson);
        const now = Date.now() / 1000; // 当前时间戳（秒）

        // 检查 token 是否过期
        if (session.expires_at && session.expires_at > now + 60) {
          // Token 仍然有效，恢复会话
          setToken(session.access_token);
          setUser(session.user);
          
          // 设置认证 cookie（用于 PDF.js 等无法传递 header 的场景）
          const maxAge = session.expires_at - Math.floor(Date.now() / 1000);
          document.cookie = `auth_token=${session.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
          
          // 恢复 profile
          const profileJson = localStorage.getItem(STORAGE_KEYS.PROFILE);
          if (profileJson) {
            setProfile(JSON.parse(profileJson));
          }
          
          // 恢复 points
          const pointsJson = localStorage.getItem(STORAGE_KEYS.POINTS);
          if (pointsJson) {
            setPoints(JSON.parse(pointsJson));
          }

          // 设置 token 自动刷新
          scheduleTokenRefresh(session.expires_at, session.refresh_token);
          
          // 异步验证 token 并更新用户信息
          verifyAndUpdateSession(session.access_token);
        } else if (session.refresh_token) {
          // Token 已过期，尝试用 refresh_token 刷新
          await refreshSession(session.refresh_token);
        } else {
          // 无法恢复会话，清除存储
          clearAuthStorage();
        }
      } catch (error) {
        console.error("Failed to restore session:", error);
        clearAuthStorage();
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    return () => {
      if (pointsRefreshTimer.current) {
        clearTimeout(pointsRefreshTimer.current);
      }
      if (tokenRefreshTimer.current) {
        clearTimeout(tokenRefreshTimer.current);
      }
    };
  }, []);

  // 清除认证相关的本地存储
  const clearAuthStorage = () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.POINTS);
    localStorage.removeItem("token"); // 兼容旧版本
    // 清除认证 cookie
    document.cookie = "auth_token=; path=/; max-age=0";
  };

  // 设置 token 自动刷新
  const scheduleTokenRefresh = (expiresAt: number, refreshToken: string) => {
    const now = Date.now() / 1000;
    const timeUntilExpiry = (expiresAt - now) * 1000 - TOKEN_REFRESH_BUFFER;

    if (timeUntilExpiry > 0) {
      tokenRefreshTimer.current = setTimeout(() => {
        refreshSession(refreshToken);
      }, timeUntilExpiry);
    }
  };

  // 刷新会话
  const refreshSession = async (refreshToken: string) => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        // 更新会话
        saveSession(data.session, data.user);
        setToken(data.session.access_token);
        setUser(data.user);
        
        // 设置新的自动刷新
        scheduleTokenRefresh(data.session.expires_at, data.session.refresh_token);
      } else {
        // 刷新失败，清除会话
        clearAuthStorage();
        setUser(null);
        setToken(null);
        setProfile(null);
        setPoints(null);
      }
    } catch (error) {
      console.error("Failed to refresh session:", error);
      clearAuthStorage();
      setUser(null);
      setToken(null);
    }
  };

  // 保存会话到本地存储
  const saveSession = (session: any, user: User) => {
    const sessionData: SessionData = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
      user: user,
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
    // 兼容旧代码
    localStorage.setItem("token", session.access_token);
    
    // 同时设置 cookie，用于 PDF.js 等无法传递 header 的场景
    // Cookie 有效期与 session 相同（默认1小时）
    const maxAge = (session.expires_at || Math.floor(Date.now() / 1000) + 3600) - Math.floor(Date.now() / 1000);
    document.cookie = `auth_token=${session.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
  };

  // 验证并更新会话
  const verifyAndUpdateSession = async (accessToken: string) => {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setProfile(data.profile);
        
        // 保存 profile 到本地存储
        if (data.profile) {
          localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(data.profile));
        }
        
        // 更新积分
        if (data.points) {
          setPoints(data.points);
          localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(data.points));
        }
      } else {
        // Token 验证失败，可能已过期
        const sessionJson = localStorage.getItem(STORAGE_KEYS.SESSION);
        if (sessionJson) {
          const session: SessionData = JSON.parse(sessionJson);
          if (session.refresh_token) {
            await refreshSession(session.refresh_token);
          }
        }
      }
    } catch (error) {
      console.error("Failed to verify session:", error);
    }
  };

  // 优化的积分刷新函数，带防抖和缓存
  const refreshPoints = useCallback(async () => {
    const storedToken = token || localStorage.getItem("token");
    if (!storedToken) return;
    
    const now = Date.now();
    const timeSinceLastRefresh = now - lastPointsRefresh.current;
    
    if (timeSinceLastRefresh < POINTS_CACHE_TIME) {
      if (pointsRefreshTimer.current) {
        clearTimeout(pointsRefreshTimer.current);
      }
      
      pointsRefreshTimer.current = setTimeout(() => {
        fetchPointsOnly(storedToken);
      }, POINTS_CACHE_TIME - timeSinceLastRefresh);
      return;
    }
    
    await fetchPointsOnly(storedToken);
  }, [token]);

  const fetchPointsOnly = async (accessToken: string) => {
    try {
      lastPointsRefresh.current = Date.now();
      const response = await fetch("/api/points?lightweight=true", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPoints(data.points);
        localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(data.points));
      }
    } catch (error) {
      console.error("Failed to fetch points:", error);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "登录失败");
    }

    // 保存会话到本地存储
    saveSession(data.session, data.user);
    
    setToken(data.session.access_token);
    setUser(data.user);
    setProfile(data.profile);
    
    // 保存 profile
    if (data.profile) {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(data.profile));
    }
    
    // 获取积分
    if (data.points) {
      setPoints(data.points);
      localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(data.points));
    } else {
      fetchPointsOnly(data.session.access_token);
    }
    
    // 设置 token 自动刷新
    if (data.session.expires_at && data.session.refresh_token) {
      scheduleTokenRefresh(data.session.expires_at, data.session.refresh_token);
    }
    
    // 返回角色信息
    const isAdminRole = data.profile?.role === "admin";
    const isVolunteerRole = data.profile?.role === "volunteer" || isAdminRole;
    return { isAdmin: isAdminRole, isVolunteer: isVolunteerRole };
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "注册失败");
    }
  };

  const logout = () => {
    clearAuthStorage();
    setToken(null);
    setUser(null);
    setProfile(null);
    setPoints(null);
    lastPointsRefresh.current = 0;
    
    if (tokenRefreshTimer.current) {
      clearTimeout(tokenRefreshTimer.current);
    }
  };

  const isAdmin = profile?.role === "admin";
  const isVolunteer = profile?.role === "volunteer" || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        token,
        points,
        loading,
        login,
        register,
        logout,
        refreshPoints,
        isAdmin,
        isVolunteer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
