"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Search, Upload, User, LogIn, UserPlus, Settings, LogOut, Folder, Clock, TrendingUp, Coins, ArrowUpDown, ChevronsDown, Edit2, Award, Camera } from "lucide-react";
import { File, Category } from "@/types";
import { toast } from "sonner";
import Link from "next/link";

import { useDebounce } from "@/hooks/useDebounce";
import { FileCardSkeleton } from "@/components/Loading";
import { Empty } from "@/components/Empty";
import FileCard from "@/components/FileCard";
import FileUploadDialog from "@/components/FileUploadDialog";
import AuthDialog from "@/components/AuthDialog";
import FileDetailDialog from "@/components/FileDetailDialog";
import Footer from "@/components/Footer";
import { uploadAvatarDirectToCos } from "@/lib/browser-upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 排序选项
const SORT_OPTIONS = [
  { value: "created_at", label: "最新上传" },
  { value: "download_count", label: "下载量最高" },
  { value: "average_rating", label: "评分最高" },
  { value: "comprehensive", label: "综合推荐" },
] as const;

// 每页数量
const PAGE_SIZE = 12;
const FEATURED_CATEGORY = "__featured__";

export default function Home() {
  const { user, profile, points, logout, isVolunteer, refreshPoints } = useAuth();
  
  // 数据状态
  const [files, setFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const requestLockRef = useRef(false);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const bottomGestureIdleTimerRef = useRef<number | null>(null);
  const bottomGestureAutoLoadTimerRef = useRef<number | null>(null);
  const bottomGestureScoreRef = useRef(0);
  const [footerFullyVisible, setFooterFullyVisible] = useState(false);
  const [bottomTriggerVisible, setBottomTriggerVisible] = useState(false);
  const [bottomTriggerReady, setBottomTriggerReady] = useState(false);
  const [bottomTriggerProgress, setBottomTriggerProgress] = useState(0);
  
  // 筛选状态
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("comprehensive");
  
  // 对话框状态
  const [uploadOpen, setUploadOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // 个人资料编辑对话框状态
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    avatar: "",
  });
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // 防抖搜索
  const debouncedSearch = useDebounce(searchQuery, 300);

  // 计算统计信息
  const stats = useMemo(() => ({
    total: files.length,
    weekNew: files.filter(f => {
      const created = new Date(f.created_at);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return created > weekAgo;
    }).length,
  }), [files]);

  // 获取分类列表
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/categories");
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  }, []);

  // 获取文件列表
  const fetchFiles = useCallback(async (pageToFetch = 0, resetPage = false) => {
    if (requestLockRef.current) return;
    requestLockRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (selectedCategory === FEATURED_CATEGORY) {
        params.append("is_featured", "true");
      } else if (selectedCategory) {
        params.append("category", selectedCategory);
      }
      params.append("sortBy", sortBy);
      params.append("limit", String(PAGE_SIZE));
      params.append("offset", String(pageToFetch * PAGE_SIZE));

      const response = await fetch(`/api/files?${params}`);
      const data = await response.json();
      
      const newFiles = data.files || [];
      
      if (resetPage) {
        setFiles(newFiles);
      } else {
        setFiles(prev => {
          const seen = new Set(prev.map((file) => file.id));
          const merged = [...prev];
          for (const file of newFiles) {
            if (!seen.has(file.id)) {
              seen.add(file.id);
              merged.push(file);
            }
          }
          return merged;
        });
      }
      pageRef.current = pageToFetch;
      
      setHasMore(newFiles.length === PAGE_SIZE);
    } catch (error) {
      console.error("Failed to fetch files:", error);
      toast.error("加载失败，请重试");
    } finally {
      setLoading(false);
      requestLockRef.current = false;
    }
  }, [debouncedSearch, selectedCategory, sortBy]);

  // 处理PDF预览图生成完成 - 更新文件列表中的预览URL
  const handlePreviewGenerated = useCallback((fileId: string, previewUrl: string) => {
    setFiles(prev => prev.map(file => 
      file.id === fileId ? { ...file, preview_url: previewUrl } : file
    ));
  }, []);

  // 初始化
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // 搜索/筛选变化时重新加载
  useEffect(() => {
    pageRef.current = 0;
    fetchFiles(0, true);
  }, [debouncedSearch, selectedCategory, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // 下载文件
  const handleDownload = useCallback(async (fileId: string, fileName: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("请先登录");
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }

    try {
      const response = await fetch(`/api/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.code === "INSUFFICIENT_POINTS") {
          toast.error(data.error);
          return;
        }
        throw new Error(data.error);
      }

      const link = document.createElement("a");
      link.href = data.downloadUrl;
      link.download = fileName;
      link.rel = "noopener noreferrer";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success(`下载成功${data.pointsDeducted ? `，消耗 ${data.pointsDeducted} 积分` : ""}`);
      fetchFiles(0, true);
      refreshPoints();
    } catch (error) {
      console.error("Download error:", error);
      toast.error(error instanceof Error ? error.message : "下载失败");
    }
  }, [fetchFiles, refreshPoints]);

  // 删除文件
  const handleDelete = useCallback(async (fileId: string) => {
    if (!confirm("确定要删除这个文件吗？")) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("删除成功");
      fetchFiles(0, true);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("删除失败");
    }
  }, [fetchFiles]);

  // 打开文件详情
  const openFileDetail = useCallback((file: File) => {
    setSelectedFile(file);
    setDetailOpen(true);
  }, []);

  // 加载更多
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    fetchFiles(pageRef.current + 1, false);
  }, [loading, hasMore, fetchFiles]);

  useEffect(() => {
    const footerEl = footerRef.current;
    if (!footerEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const fullyVisible = entry.isIntersecting && entry.intersectionRatio >= 0.98;
        setFooterFullyVisible(fullyVisible);
        if (!fullyVisible) {
          bottomGestureScoreRef.current = 0;
          setBottomTriggerVisible(false);
          setBottomTriggerReady(false);
          setBottomTriggerProgress(0);
        }
      },
      {
        threshold: [0.98, 1],
      }
    );

    observer.observe(footerEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let rafId = 0;

    const clearTimers = () => {
      if (bottomGestureIdleTimerRef.current !== null) {
        window.clearTimeout(bottomGestureIdleTimerRef.current);
        bottomGestureIdleTimerRef.current = null;
      }
      if (bottomGestureAutoLoadTimerRef.current !== null) {
        window.clearTimeout(bottomGestureAutoLoadTimerRef.current);
        bottomGestureAutoLoadTimerRef.current = null;
      }
    };

    const resetTrigger = () => {
      clearTimers();
      bottomGestureScoreRef.current = 0;
      setBottomTriggerVisible(false);
      setBottomTriggerReady(false);
      setBottomTriggerProgress(0);
    };

    const getBottomProximity = () => {
      const doc = document.documentElement;
      const bottomGap = Math.max(0, doc.scrollHeight - (window.scrollY + window.innerHeight));
      const activationRange = Math.max(240, Math.min(720, window.innerHeight * 0.72));
      const rawProgress = Math.max(0, Math.min(1, 1 - bottomGap / activationRange));
      return { bottomGap, progress: rawProgress };
    };

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        if (!hasMore || loading || !footerFullyVisible) {
          resetTrigger();
          return;
        }

        const { bottomGap, progress } = getBottomProximity();
        const isNearBottom = bottomGap <= Math.max(160, window.innerHeight * 0.22);

        if (!isNearBottom) {
          resetTrigger();
          return;
        }

        bottomGestureScoreRef.current = progress;
        setBottomTriggerVisible(true);
        setBottomTriggerProgress(1 - Math.pow(1 - progress, 5));

        if (progress >= 0.72) {
          setBottomTriggerReady(true);
        } else if (progress < 0.5) {
          setBottomTriggerReady(false);
        }

        if (bottomGestureAutoLoadTimerRef.current !== null) {
          window.clearTimeout(bottomGestureAutoLoadTimerRef.current);
        }
        bottomGestureAutoLoadTimerRef.current = window.setTimeout(() => {
          if (!hasMore || loading || !footerFullyVisible) return;
          const { bottomGap: latestGap } = getBottomProximity();
          if (latestGap <= 2) {
            resetTrigger();
            loadMore();
          }
        }, 120);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      clearTimers();
      window.removeEventListener("scroll", onScroll);
    };
  }, [hasMore, loading, loadMore, footerFullyVisible]);

  // 头像上传处理
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("图片大小不能超过2MB");
      return;
    }

    setProfileUploading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("请先登录");
      }

      const { url } = await uploadAvatarDirectToCos(file, token);
      setProfileForm(prev => ({ ...prev, avatar: url }));
      toast.success("头像上传成功");
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast.error("头像上传失败");
    } finally {
      setProfileUploading(false);
      e.target.value = "";
    }
  }, []);

  // 保存个人资料
  const handleProfileSave = useCallback(async () => {
    if (!profileForm.name.trim()) {
      toast.error("请输入昵称");
      return;
    }

    setProfileSaving(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profileForm.name.trim(),
          avatar: profileForm.avatar || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("保存成功");
      setProfileEditOpen(false);
      
      // 刷新用户信息
      window.location.reload();
    } catch (error) {
      console.error("Profile save error:", error);
      toast.error("保存失败");
    } finally {
      setProfileSaving(false);
    }
  }, [profileForm]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Header */}
      <header className="glass-header sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-4 sm:gap-8 flex-1 min-w-0">
              {/* Logo */}
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap shrink-0">
                <span className="text-[#005BA3]">嘀嗒</span>
                <span className="text-[#64748B]">资料库</span>
              </h1>

              {/* Search */}
              <div className="relative flex-1 max-w-md hidden sm:block">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="搜索资料..."
                  className="neu-input pl-12 text-[#1E293B] placeholder-[#94A3B8] w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {user ? (
                <>
                  <button
                    onClick={() => setUploadOpen(true)}
                    className="neu-button-primary flex items-center gap-2 whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">上传资料</span>
                  </button>

                  {isVolunteer && (
                    <Link href="/admin">
                      <button className="glass-button flex items-center gap-2 whitespace-nowrap">
                        <Settings className="w-4 h-4 flex-shrink-0" />
                        <span className="hidden sm:inline">管理</span>
                      </button>
                    </Link>
                  )}

                  {/* User Profile - 点击可编辑 */}
                  <button
                    onClick={() => {
                      setProfileForm({
                        name: profile?.name || "",
                        avatar: profile?.avatar || "",
                      });
                      setProfileEditOpen(true);
                    }}
                    className="flex items-center gap-2 sm:gap-3 glass-card px-3 sm:px-4 py-2 hover:bg-[#F0F7FF] transition-colors cursor-pointer"
                    title="点击编辑个人资料"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#005BA3] flex items-center justify-center text-white text-sm font-medium overflow-hidden">
                      {profile?.avatar ? (
                        <img src={profile.avatar} alt={profile.name || "用户"} className="w-full h-full object-cover" />
                      ) : profile?.name?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
                    </div>
                    <div className="text-left hidden md:block">
                      <div className="text-sm font-medium text-[#1E293B]">{profile?.name}</div>
                      <div className="text-xs text-[#64748B] flex items-center gap-1">
                        <span>
                          {profile?.role === "admin" ? "管理员" : profile?.role === "volunteer" ? "志愿者" : "访客"}
                        </span>
                        <span className="mx-1">·</span>
                        <Coins className="w-3 h-3 inline text-[#F59E0B]" />
                        <span className="text-[#F59E0B] font-medium">{points?.balance ?? 0}</span>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={logout}
                    className="p-2 rounded-lg hover:bg-[#F1F5F9] transition-colors text-[#64748B] hover:text-[#1E293B]"
                    title="退出登录"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setAuthMode("login");
                      setAuthOpen(true);
                    }}
                    className="glass-button whitespace-nowrap"
                  >
                    <LogIn className="w-4 h-4 mr-1 sm:mr-2 inline flex-shrink-0" />
                    <span>登录</span>
                  </button>
                  <button
                    onClick={() => {
                      setAuthMode("register");
                      setAuthOpen(true);
                    }}
                    className="neu-button-primary whitespace-nowrap"
                  >
                    <UserPlus className="w-4 h-4 mr-1 sm:mr-2 inline flex-shrink-0" />
                    <span>注册</span>
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Mobile Search */}
          <div className="relative mt-3 sm:hidden">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="搜索资料..."
              className="neu-input pl-12 text-[#1E293B] placeholder-[#94A3B8] w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 flex-1">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="glass-card p-5 sticky top-24">
              <h2 className="text-sm font-semibold text-[#64748B] mb-4 flex items-center gap-2">
                <Folder className="w-4 h-4" />
                分类
              </h2>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedCategory("")}
                  className={`w-full text-left px-4 py-2.5 rounded-lg transition-all text-sm ${
                    selectedCategory === ""
                      ? "bg-[#005BA3] text-white"
                      : "hover:bg-[#F1F5F9] text-[#475569]"
                  }`}
                >
                  全部资料
                </button>
                <button
                  onClick={() => setSelectedCategory(FEATURED_CATEGORY)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg transition-all text-sm flex items-center gap-2 ${
                    selectedCategory === FEATURED_CATEGORY
                      ? "bg-[#005BA3] text-white"
                      : "hover:bg-[#F1F5F9] text-[#475569]"
                  }`}
                >
                  <span>精选资料</span>
                  <Award className="w-3.5 h-3.5 ml-auto shrink-0 opacity-80" />
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`w-full text-left px-4 py-2.5 rounded-lg transition-all text-sm ${
                      selectedCategory === category.id
                        ? "bg-[#005BA3] text-white"
                        : "hover:bg-[#F1F5F9] text-[#475569]"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              {/* Stats */}
              <div className="mt-6 pt-5 border-t border-[#E2E8F0]">
                <h3 className="text-sm font-semibold text-[#64748B] mb-3">统计</h3>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#64748B] flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5" />
                      总资料
                    </span>
                    <span className="font-medium text-[#1E293B]">{stats.total}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#64748B] flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      本周新增
                    </span>
                    <span className="font-medium text-[#1E293B]">{stats.weekNew}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-5 gap-4">
              <div className="text-sm text-[#64748B]">
                共 <span className="font-semibold text-[#1E293B]">{files.length}</span> 个资料
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-[#64748B]" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#005BA3]/20 focus:border-[#005BA3] cursor-pointer"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mobile Category Filter */}
            <div className="lg:hidden mb-5 overflow-x-auto pb-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedCategory("")}
                  className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all ${
                    selectedCategory === ""
                      ? "bg-[#005BA3] text-white"
                      : "bg-white border border-[#E2E8F0] text-[#475569]"
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setSelectedCategory(FEATURED_CATEGORY)}
                  className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all inline-flex items-center gap-1 ${
                    selectedCategory === FEATURED_CATEGORY
                      ? "bg-[#005BA3] text-white"
                      : "bg-white border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]"
                  }`}
                >
                  <span>精选</span>
                  <Award className="w-3.5 h-3.5 ml-1 shrink-0 opacity-80" />
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all ${
                      selectedCategory === category.id
                        ? "bg-[#005BA3] text-white"
                        : "bg-white border border-[#E2E8F0] text-[#475569]"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {/* File List */}
            {loading && files.length === 0 ? (
              <FileCardSkeleton count={6} />
            ) : files.length === 0 ? (
              <Empty
                icon={Upload}
                title="暂无资料"
                description="成为第一个上传者吧"
                action={
                  user ? (
                    <button
                      onClick={() => setUploadOpen(true)}
                      className="neu-button-primary"
                    >
                      <Upload className="w-4 h-4 mr-2 inline" />
                      上传资料
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {files.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      isVolunteer={isVolunteer}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                      onClick={() => openFileDetail(file)}
                      onPreviewGenerated={handlePreviewGenerated}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div className="flex justify-center pt-6 pb-2">
                    <div
                      className={`relative w-full max-w-[320px] overflow-hidden rounded-[24px] border bg-white/80 px-4 py-4 backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        bottomTriggerVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
                      }`}
                      style={{
                        transform: `translateY(${bottomTriggerVisible ? 0 : 12}px) scale(${0.975 + bottomTriggerProgress * 0.02})`,
                        borderColor: bottomTriggerReady ? "rgba(245,158,11,0.28)" : "rgba(245,158,11,0.12)",
                        boxShadow: bottomTriggerReady
                          ? "0 12px 34px rgba(245,158,11,0.12), 0 6px 20px rgba(15,23,42,0.04)"
                          : "0 10px 30px rgba(15,23,42,0.05)",
                      }}
                      aria-live="polite"
                    >
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: bottomTriggerReady
                            ? "radial-gradient(circle at 20% 10%, rgba(253,230,138,0.22), transparent 30%), linear-gradient(90deg, rgba(255,255,255,0.14), rgba(245,158,11,0.04), rgba(255,255,255,0.14))"
                            : "radial-gradient(circle at 20% 10%, rgba(253,230,138,0.16), transparent 30%), linear-gradient(90deg, rgba(255,255,255,0.12), rgba(245,158,11,0.02), rgba(255,255,255,0.12))",
                          transform: `translateX(${bottomTriggerProgress * 8}px)`,
                        }}
                      />
                      <div className="relative flex items-center gap-3">
                        <div
                          className={`relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full transition-all duration-500 ${
                            bottomTriggerReady
                              ? "bg-gradient-to-br from-[#FFF7CF] via-[#FFE7A8] to-[#FFD77A]"
                              : "bg-gradient-to-br from-[#FFF8E8] via-[#FFF0C8] to-[#FFE6A0]"
                          }`}
                        >
                          <div
                            className={`absolute inset-0 rounded-full border border-[#F59E0B]/20 transition-all duration-500 ${
                              bottomTriggerReady ? "scale-105 opacity-100" : "scale-100 opacity-80"
                            }`}
                          />
                          <div
                            className="absolute inset-1 rounded-full bg-white/35 blur-[0.5px]"
                            style={{
                              opacity: 0.88 - bottomTriggerProgress * 0.22,
                            }}
                          />
                          <div
                            className="absolute inset-2 rounded-full border border-white/55"
                            style={{
                              transform: `scale(${0.92 + bottomTriggerProgress * 0.08})`,
                              opacity: 0.75,
                            }}
                          />
                          <ChevronsDown
                            className={`relative z-10 h-4 w-4 transition-all duration-500 ${
                              bottomTriggerReady ? "text-[#A85508]" : "text-[#B45309]"
                            }`}
                            style={{
                              transform: `translateY(${bottomTriggerReady ? 0 : 2 - bottomTriggerProgress * 3}px) scale(${0.96 + bottomTriggerProgress * 0.05})`,
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`text-[14px] font-semibold tracking-tight transition-all duration-300 ${bottomTriggerReady ? "text-[#8A4A06]" : "text-[#7C5C18]"}`}>
                            {bottomTriggerReady ? "松手加载更多" : "继续下滑"}
                          </div>
                          <div className={`mt-0.5 text-[11px] transition-opacity duration-300 ${bottomTriggerReady ? "text-[#B45309]/80" : "text-[#C47A15]/70"}`}>
                            {bottomTriggerReady ? "已就绪" : "完成触发"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Dialogs */}
      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        categories={categories}
        onSuccess={() => fetchFiles(0, true)}
        userRole={profile?.role}
      />

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        mode={authMode}
        onModeChange={setAuthMode}
      />

      <FileDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        file={selectedFile}
        onDownload={handleDownload}
      />

      {/* 个人资料编辑对话框 */}
      <Dialog open={profileEditOpen} onOpenChange={setProfileEditOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-[#005BA3]" />
              编辑个人资料
            </DialogTitle>
            <DialogDescription>
              修改您的昵称和头像
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* 头像上传 */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-[#005BA3] flex items-center justify-center overflow-hidden">
                  {profileForm.avatar ? (
                    <img
                      src={profileForm.avatar}
                      alt="头像"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 text-white" />
                  )}
                </div>
                <label className="absolute bottom-0 right-0 w-7 h-7 bg-[#005BA3] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#004A8C] transition-colors shadow-lg">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={profileUploading}
                  />
                  {profileUploading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-white" />
                  )}
                </label>
              </div>
              <p className="text-xs text-[#94A3B8]">点击更换头像</p>
            </div>

            {/* 昵称输入 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#64748B]">昵称</label>
              <Input
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder="请输入昵称"
                maxLength={20}
              />
              <p className="text-xs text-[#94A3B8]">最多20个字符</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileEditOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleProfileSave}
              disabled={profileSaving || !profileForm.name.trim()}
              className="bg-[#005BA3] hover:bg-[#004A8C]"
            >
              {profileSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div ref={footerRef}>
        <Footer />
      </div>
    </div>
  );
}
