"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  Users,
  FileText,
  Star,
  Download,
  Settings,
  ArrowLeft,
  FolderPlus,
  Coins,
  Search,
  Edit2,
  Trash2,
  UserCog,
  User,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Eye,
  ToggleLeft,
  ToggleRight,
  Award,
  FileUp,
  Calendar,
  HardDrive,
  MessageCircle,
  Upload,
  Sparkles,
  CheckCircle,
  XCircle,
  AlertTriangle,
  GripVertical,
  Tag,
  X,
  ExternalLink,
  Server,
} from "lucide-react";
import Link from "next/link";
import { Category, File as FileType } from "@/types";
import { toast } from "sonner";
import FileDetailDialog from "@/components/FileDetailDialog";
import FileUploadDialog from "@/components/FileUploadDialog";
import { POINTS_CONFIG } from "@/types/points";

// 动态导入 PDFViewer 组件，禁用 SSR
const PDFViewer = dynamic(
  () => import("@/components/PDFViewer").then((mod) => mod.PDFViewer),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-[#005BA3] border-t-transparent rounded-full" />
      </div>
    ),
  }
);

// 动态导入 PDFTileViewer 组件，禁用 SSR
const PDFTileViewer = dynamic(
  () => import("@/components/PDFTileViewer").then((mod) => mod.PDFTileViewer),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-[#005BA3] border-t-transparent rounded-full" />
      </div>
    ),
  }
);

interface UserWithPoints {
  id: string;
  user_id: string;
  email: string;
  name: string;
  phone?: string;
  school?: string;
  is_verified?: boolean;
  role: "admin" | "volunteer" | "guest";
  is_active: boolean;
  avatar?: string;
  created_at: string;
  points: number;
}

interface FileWithDetails {
  id: string;
  title: string;
  description?: string;
  file_name: string;
  file_size: number;
  file_type: string;
  mime_type?: string;
  category_id: string;
  uploader_id: string;
  download_count: number;
  average_rating: string;
  rating_count: number;
  comment_count?: number;
  is_active: boolean;
  is_featured: boolean;
  preview_url?: string;
  semester?: string;
  course?: string;
  tags?: string[];
  created_at: string;
  ai_classified_at?: string;
  reviewed_at?: string;
  categories?: { name: string };
  profiles?: { name: string; email: string; real_name?: string; student_id?: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

// 文件预览对话框组件
function FilePreviewDialog({ file }: { file: FileWithDetails }) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [officePreviewUrl, setOfficePreviewUrl] = useState<string | null>(null);
  const [officeLoading, setOfficeLoading] = useState(false);

  useEffect(() => {
    const fetchFileUrl = async () => {
      try {
        const token = localStorage.getItem("token");
        // 使用 thumbnail 接口获取文件 URL
        // 传递 token 以便管理员可以预览待审核文件
        const response = await fetch(`/api/files/${file.id}/thumbnail`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await response.json();
        
        const isPDF = file.file_type.toLowerCase() === "pdf";
        const isImage = file.mime_type?.startsWith("image/");

      // PDF 优先走 proxyUrl，利用服务端流式转发和分段请求；失败再退回 directUrl
      // 图片优先走 directUrl，保持加载速度
      if (isPDF) {
        setFileUrl(data.proxyUrl || data.directUrl || data.url || null);
      } else if (isImage && data.previewUrl) {
        setFileUrl(data.previewUrl);
      } else {
        setFileUrl(data.directUrl || data.proxyUrl || data.url || null);
        }
      } catch (error) {
        console.error("Failed to fetch file URL:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFileUrl();
  }, [file.id]);

  const isPDF = file.file_type.toLowerCase() === "pdf";
  const isImage = file.mime_type?.startsWith("image/");
  
  // 判断是否为Office文档
  const isOfficeDoc = ["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(file.file_type.toLowerCase());
  
  // 判断是否为文本文件
  const isTextFile = ["txt", "md", "json", "xml", "csv", "log", "yml", "yaml", "ini", "conf", "cfg"].includes(file.file_type.toLowerCase()) 
    || file.mime_type?.startsWith("text/");
  
  // 判断是否为代码文件
  const isCodeFile = ["js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "css", "scss", "html", "sql", "sh", "bat"].includes(file.file_type.toLowerCase());

  // 加载Office预览URL
  useEffect(() => {
    if (isOfficeDoc) {
      setOfficeLoading(true);
      const token = localStorage.getItem("token");
      
      fetch(`/api/files/${file.id}/office-preview-url`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.url) {
            // 使用微软 Office Online Viewer
            const msUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(data.url)}`;
            setOfficePreviewUrl(msUrl);
          }
        })
        .catch(err => {
          console.error("Failed to load office preview URL:", err);
        })
        .finally(() => {
          setOfficeLoading(false);
        });
    }
  }, [isOfficeDoc, file.id]);

  // 加载文本内容
  useEffect(() => {
    if ((isTextFile || isCodeFile) && fileUrl) {
      setTextLoading(true);
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => {
          setTextContent(text);
          setTextLoading(false);
        })
        .catch(err => {
          console.error("Failed to load text content:", err);
          setTextLoading(false);
        });
    }
  }, [isTextFile, isCodeFile, fileUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-[#005BA3] border-t-transparent rounded-full" />
      </div>
    );
  }

  // 图片文件直接显示
  if (isImage && fileUrl) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 flex items-center justify-center">
        <img
          src={fileUrl}
          alt={file.title}
          className="max-w-full max-h-[70vh] object-contain rounded-lg"
        />
      </div>
    );
  }

  // PDF 文件使用 PDFTileViewer 平铺显示部分页面（审核用，避免一次性渲染整份文档）
  if (isPDF && fileUrl) {
    return <PDFTileViewer url={fileUrl} className="max-h-[80vh]" />;
  }

  // Office 文档使用 WPS 在线预览
  if (isOfficeDoc) {
    if (officeLoading) {
      return (
        <div className="flex items-center justify-center h-[400px]">
          <div className="animate-spin w-8 h-8 border-2 border-[#005BA3] border-t-transparent rounded-full" />
        </div>
      );
    }
    
    if (officePreviewUrl) {
      return (
        <div className="w-full">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-blue-700">
              在线预览 {file.file_type.toUpperCase()} 文件
            </span>
          </div>
          <iframe
            src={officePreviewUrl}
            className="w-full h-[600px] border-0 rounded-lg"
            title="Office文档预览"
            allow="fullscreen"
          />
        </div>
      );
    }
    
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-[#64748B]">
        <FileText className="w-12 h-12 mb-3 opacity-50" />
        <p>预览加载失败</p>
        <p className="text-sm mt-1">请下载文件后查看</p>
      </div>
    );
  }

  // 文本文件和代码文件直接显示内容
  if ((isTextFile || isCodeFile) && fileUrl) {
    if (textLoading) {
      return (
        <div className="flex items-center justify-center h-[400px]">
          <div className="animate-spin w-8 h-8 border-2 border-[#005BA3] border-t-transparent rounded-full" />
        </div>
      );
    }
    
    if (textContent) {
      return (
        <div className="w-full">
          <div className="bg-gray-800 rounded-lg p-4 overflow-auto max-h-[70vh]">
            <pre className="text-gray-100 text-sm whitespace-pre-wrap break-all font-mono">
              {textContent}
            </pre>
          </div>
          <p className="text-xs text-[#94A3B8] mt-2">
            文件大小: {formatFileSize(file.file_size)} | 行数: {textContent.split('\n').length}
          </p>
        </div>
      );
    }
  }

  // 其他文件类型 - 显示文件信息和下载链接
  if (fileUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-[#64748B] bg-gray-50 rounded-lg">
        <FileText className="w-16 h-16 mb-4" />
        <p>此文件类型暂不支持在线预览</p>
        <p className="text-xs mt-1 text-[#94A3B8]">文件格式: {file.file_type.toUpperCase()}</p>
        <a 
          href={fileUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-3 px-4 py-2 bg-[#005BA3] text-white rounded-lg hover:bg-[#004A8C] transition-colors"
        >
          下载查看
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[200px] text-[#64748B]">
      <FileText className="w-16 h-16 mb-4" />
      <p>暂无预览</p>
      <p className="text-sm mt-2">点击下载查看文件内容</p>
    </div>
  );
}

export default function AdminPage() {
  const { isVolunteer, loading: authLoading, isAdmin: checkIsAdmin, profile } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFileCounts, setCategoryFileCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalDownloads: 0,
    totalRatings: 0,
    totalUsers: 0,
  });
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<string | null>(null);

  // 流量统计状态
  const [analyticsData, setAnalyticsData] = useState<{
    period: string;
    summary: {
      totalViews: number;
      uniqueVisitors: number;
      avgViewsPerDay: number;
      viewsGrowth: string;
    };
    dailyStats: { date: string; views: number; uniqueVisitors: number }[];
    pageTypeStats: Record<string, number>;
    topPages: { path: string; count: number }[];
    dateRange?: { start: string; end: string };
  } | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("7days");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // 分类拖拽排序状态
  const [draggedCategory, setDraggedCategory] = useState<Category | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<Category | null>(null);

  // 分类编辑状态
  const [editCategoryDialogOpen, setEditCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryForm, setEditCategoryForm] = useState({ name: "", slug: "" });
  const [editCategoryLoading, setEditCategoryLoading] = useState(false);

  // 标签页状态
  const [activeTab, setActiveTab] = useState<"stats" | "analytics" | "files" | "users" | "categories">("stats");

  // 用户管理状态
  const [users, setUsers] = useState<UserWithPoints[]>([]);
  const [userPagination, setUserPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // 文件管理状态
  const [files, setFiles] = useState<FileWithDetails[]>([]);
  const [filePagination, setFilePagination] = useState<Pagination>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 0,
  });
  const [fileSearch, setFileSearch] = useState("");
  const [fileCategoryFilter, setFileCategoryFilter] = useState("");
  const [fileFeaturedFilter, setFileFeaturedFilter] = useState("");
  const [fileStatusFilter, setFileStatusFilter] = useState("");
  const [aiStatusFilter, setAiStatusFilter] = useState("");

  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const fileListRequestRef = useRef<AbortController | null>(null);
  const fileListLoadingRef = useRef(false);
  
  // 文件详情对话框
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileWithDetails | null>(null);
  
  // 文件上传对话框
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // 编辑用户对话框
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithPoints | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    avatar: "",
    role: "guest" as "admin" | "volunteer" | "guest",
    is_verified: false,
    is_active: true,
  });
  const [avatarUploading, setAvatarUploading] = useState(false);

  // 赠送积分对话框
  const [pointsDialogOpen, setPointsDialogOpen] = useState(false);
  const [giftingUser, setGiftingUser] = useState<UserWithPoints | null>(null);
  const [giftAmount, setGiftAmount] = useState("10");
  const [giftReason, setGiftReason] = useState("");

  // 文件编辑对话框
  const [fileEditDialogOpen, setFileEditDialogOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<FileWithDetails | null>(null);

  // 文件预览对话框
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewingFile, setPreviewingFile] = useState<FileWithDetails | null>(null);

  // 修改分类对话框
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategoryFile, setEditingCategoryFile] = useState<FileWithDetails | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  // 编辑标签对话框
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [editingTagsFile, setEditingTagsFile] = useState<FileWithDetails | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");

  // AI 审核状态
  const [aiReviewDialogOpen, setAiReviewDialogOpen] = useState(false);
  const [aiReviewFiles, setAiReviewFiles] = useState<Array<{
    id: string;
    fileName: string;
    title: string;
    fileKey?: string;
    fileType?: string;
    mimeType?: string;
    currentCategory: string;
    selected?: boolean;
    // 审核结果
    reviewError?: string | null;
    compliant?: boolean;
    complianceIssue?: string | null;
    categoryCorrect?: boolean;
    suggestedCategory?: string | null;
    suggestedCategoryId?: string | null;
    optimizedTitle?: string;
    titleChanged?: boolean;
  }>>([]);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewAnalyzing, setAiReviewAnalyzing] = useState(false);
  const [aiReviewStep, setAiReviewStep] = useState<"select" | "review" | "confirm">("select");
  const [aiReviewStats, setAiReviewStats] = useState<{
    total: number;
    compliant: number;
    nonCompliant: number;
    categoryCorrect: number;
    categoryNeedFix: number;
    titleNeedOptimize: number;
    failed?: number;
  } | null>(null);

  const isAdmin = checkIsAdmin;

  useEffect(() => {
    if (!authLoading && !isVolunteer) {
      router.push("/");
    }
  }, [authLoading, isVolunteer, router]);

  useEffect(() => {
    if (isVolunteer) {
      fetchCategories();
      fetchStats();
      fetchUsers();
    }
  }, [isVolunteer]);

  useEffect(() => {
    if (isVolunteer) {
      fetchUsers();
    }
  }, [userPagination.page, roleFilter]);

  useEffect(() => {
    if (!isVolunteer || activeTab !== "files") return;

    const timer = window.setTimeout(() => {
      fetchFiles(1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    isVolunteer,
    activeTab,
    fileSearch,
    fileCategoryFilter,
    fileFeaturedFilter,
    fileStatusFilter,
    aiStatusFilter,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    return () => {
      fileListRequestRef.current?.abort();
    };
  }, []);

  // 加载流量统计
  useEffect(() => {
    if (!(isVolunteer && activeTab === "analytics")) return;

    fetchAnalytics(analyticsPeriod);
    const refreshTimer = window.setInterval(() => {
      fetchAnalytics(analyticsPeriod);
    }, 30000);

    return () => window.clearInterval(refreshTimer);
  }, [isVolunteer, activeTab, analyticsPeriod]);

  useEffect(() => {
    if (!isVolunteer) return;

    fetchStats();
    fetchCategories();

    const refreshTimer = window.setInterval(() => {
      fetchStats();
      fetchCategories();
    }, 60000);

    return () => window.clearInterval(refreshTimer);
  }, [isVolunteer]);

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories?include_counts=true");
      const data = await response.json();
      const categoryList = (data.categories || []) as Array<Category & { file_count?: number }>;
      setCategories(categoryList);
      setCategoryFileCounts(
        Object.fromEntries(categoryList.map((category) => [category.id, category.file_count ?? 0]))
      );
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (response.ok) {
        setStats({
          totalFiles: data.totalFiles || 0,
          totalDownloads: data.totalDownloads || 0,
          totalRatings: data.totalRatings || 0,
          totalUsers: data.totalUsers || 0,
        });
        setStatsUpdatedAt(data.generatedAt || new Date().toISOString());
      } else {
        throw new Error(data.error || "获取统计数据失败");
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  // 获取流量统计数据
  const fetchAnalytics = async (period: string = "7days") => {
    setAnalyticsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/analytics?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setAnalyticsData(data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // 导出流量统计报告
  const exportAnalyticsReport = async () => {
    if (!analyticsData) return;

    const periodLabel = {
      "7days": "近7天",
      "30days": "近30天",
      "90days": "近90天",
    }[analyticsPeriod] || analyticsPeriod;

    const toastId = toast.loading("正在导出详细数据...");

    try {
      const token = localStorage.getItem("token");
      
      // 获取详细访问记录（分批获取，每批1000条）
      const allPageViews: Array<Record<string, unknown>> = [];
      let page = 1;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(
          `/api/admin/analytics?period=${analyticsPeriod}&detail=true&page=${page}&limit=${limit}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        allPageViews.push(...data.pageViews);
        
        if (data.pageViews.length < limit || page >= data.pagination.totalPages) {
          hasMore = false;
        } else {
          page++;
        }
      }

      // 构建CSV内容
      const csvRows: string[] = [];

      // 标题
      csvRows.push(`流量统计详细报告 - ${periodLabel}`);
      csvRows.push(`导出时间,${new Date().toLocaleString("zh-CN")}`);
      csvRows.push(`时间范围,${new Date(analyticsData.dateRange?.start || new Date()).toLocaleDateString("zh-CN")} 至 ${new Date(analyticsData.dateRange?.end || new Date()).toLocaleDateString("zh-CN")}`);
      csvRows.push(`总记录数,${allPageViews.length}`);
      csvRows.push("");

      // 概览统计
      csvRows.push("=== 概览统计 ===");
      csvRows.push(`总访问量,${analyticsData.summary.totalViews}`);
      csvRows.push(`独立访客,${analyticsData.summary.uniqueVisitors}`);
      csvRows.push(`日均访问,${analyticsData.summary.avgViewsPerDay}`);
      csvRows.push(`访问增长率,${analyticsData.summary.viewsGrowth}%`);
      csvRows.push("");

      // 每日访问趋势
      csvRows.push("=== 每日访问趋势 ===");
      csvRows.push("日期,访问量,独立访客");
      analyticsData.dailyStats.forEach(stat => {
        csvRows.push(`${stat.date},${stat.views},${stat.uniqueVisitors}`);
      });
      csvRows.push("");

      // 页面类型分布
      csvRows.push("=== 页面类型分布 ===");
      csvRows.push("页面类型,访问量,占比");
      const typeLabels: Record<string, string> = {
        home: "首页",
        file_detail: "文件详情",
        download: "下载页",
        profile: "个人中心",
        rankings: "排行榜",
        search: "搜索页",
        admin: "管理后台",
        page: "其他页面",
        event: "事件追踪",
      };
      const totalViewsCount = Object.values(analyticsData.pageTypeStats).reduce((a, b) => a + b, 0);
      Object.entries(analyticsData.pageTypeStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          const percentage = totalViewsCount > 0 ? ((count / totalViewsCount) * 100).toFixed(1) : "0";
          csvRows.push(`${typeLabels[type] || type},${count},${percentage}%`);
        });
      csvRows.push("");

      // 热门页面 TOP 10
      csvRows.push("=== 热门页面 TOP 10 ===");
      csvRows.push("排名,页面路径,访问量");
      analyticsData.topPages.forEach((page, index) => {
        csvRows.push(`${index + 1},${page.path === "/" ? "首页" : page.path},${page.count}`);
      });
      csvRows.push("");

      // 详细访问记录
      csvRows.push("=== 详细访问记录 ===");
      csvRows.push("序号,访问时间,IP地址,页面路径,页面类型,来源,浏览器,操作系统,设备类型,会话ID");
      
      allPageViews.forEach((view, index) => {
        const pageTypeLabel = typeLabels[view.pageType] || view.pageType || "未知";
        const referrer = view.referrer || "直接访问";
        const time = new Date(view.createdAt).toLocaleString("zh-CN");
        
        csvRows.push([
          index + 1,
          time,
          view.ipAddress || "未知",
          `"${view.pagePath || ""}"`,
          pageTypeLabel,
          `"${referrer}"`,
          view.browser || "未知",
          view.os || "未知",
          view.device || "未知",
          view.sessionId || "",
        ].join(","));
      });

      // 生成并下载CSV文件
      const csvContent = csvRows.join("\n");
      const BOM = "\uFEFF"; // 添加BOM以支持Excel正确显示中文
      const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `流量统计详细报告_${periodLabel}_${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success(`已导出 ${allPageViews.length} 条访问记录`, { id: toastId });
    } catch (error) {
      console.error("Export error:", error);
      toast.error("导出失败", { id: toastId });
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        page: userPagination.page.toString(),
        limit: userPagination.limit.toString(),
      });
      
      if (userSearch) params.append("search", userSearch);
      if (roleFilter && roleFilter !== "all") params.append("role", roleFilter);

      const response = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      console.log("fetchUsers response:", { ok: response.ok, status: response.status, data });

      if (response.ok) {
        setUsers(data.users || []);
        setUserPagination(data.pagination);
        setStats(prev => ({ ...prev, totalUsers: data.pagination.total }));
      } else {
        console.error("fetchUsers failed:", data);
        toast.error(data.error || "获取用户列表失败");
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error("获取用户列表失败");
    }
  };

  const fetchFiles = async (pageOverride?: number) => {
    if (fileListLoadingRef.current) {
      fileListRequestRef.current?.abort();
    }

    fileListLoadingRef.current = true;
    fileListRequestRef.current?.abort();
    const controller = new AbortController();
    fileListRequestRef.current = controller;

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found");
        return;
      }
      
      const params = new URLSearchParams({
        page: (pageOverride ?? filePagination.page).toString(),
        limit: filePagination.limit.toString(),
        sortBy,
        sortOrder,
      });
      
      if (fileSearch) params.append("search", fileSearch);
      if (fileCategoryFilter && fileCategoryFilter !== "all") params.append("category", fileCategoryFilter);
      if (fileFeaturedFilter && fileFeaturedFilter !== "all") params.append("is_featured", fileFeaturedFilter);
      if (fileStatusFilter && fileStatusFilter !== "all") params.append("is_active", fileStatusFilter);
      if (aiStatusFilter && aiStatusFilter !== "all") params.append("ai_status", aiStatusFilter);

      const response = await fetch(`/api/admin/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const data = await response.json();

      if (response.ok) {
        setFiles(data.files || []);
        setFilePagination(data.pagination);
      } else if (controller.signal.aborted) {
        return;
      } else {
        console.error("Failed to fetch files:", data.error);
        toast.error(data.error || "获取文件列表失败");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch files:", error);
      toast.error("获取文件列表失败");
    } finally {
      if (fileListRequestRef.current === controller) {
        fileListLoadingRef.current = false;
        fileListRequestRef.current = null;
      }
    }
  };

  const handleUserSearch = () => {
    setUserPagination(prev => ({ ...prev, page: 1 }));
    fetchUsers();
  };

  const handleFileSearch = () => {
    fetchFiles(1);
  };

  const handleCreateCategory = async () => {
    const name = prompt("输入分类名称");
    if (!name) return;

    const slug = name.toLowerCase().replace(/\s+/g, "-");
    
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, slug }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("创建成功");
      fetchCategories();
    } catch (error) {
      console.error("Create category error:", error);
      toast.error("创建失败");
    }
  };

  // 打开编辑分类对话框
  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setEditCategoryForm({ name: category.name, slug: category.slug || "" });
    setEditCategoryDialogOpen(true);
  };

  // 保存编辑分类
  const handleSaveEditCategory = async () => {
    if (!editingCategory) return;
    if (!editCategoryForm.name.trim()) {
      toast.error("分类名称不能为空");
      return;
    }

    setEditCategoryLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/categories", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingCategory.id,
          name: editCategoryForm.name.trim(),
          slug: editCategoryForm.slug.trim() || editCategoryForm.name.toLowerCase().replace(/\s+/g, "-"),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("更新成功");
      setEditCategoryDialogOpen(false);
      setEditingCategory(null);
      fetchCategories();
    } catch (error) {
      console.error("Update category error:", error);
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setEditCategoryLoading(false);
    }
  };

  // 删除分类
  const handleDeleteCategory = async (category: Category) => {
    // 检查是否有文件
    const fileCount = categoryFileCounts[category.id] ?? 0;
    if (fileCount > 0) {
      toast.error(`该分类下有 ${fileCount} 个文件，无法删除`);
      return;
    }

    if (!confirm(`确定要删除分类「${category.name}」吗？此操作不可恢复。`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/categories?id=${category.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("删除成功");
      fetchCategories();
    } catch (error) {
      console.error("Delete category error:", error);
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  // 分类拖拽排序相关函数
  const handleCategoryDragStart = (e: React.DragEvent, category: Category) => {
    setDraggedCategory(category);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", category.id);
    // 添加拖拽样式
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = "0.5";
  };

  const handleCategoryDragEnd = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = "1";
    setDraggedCategory(null);
    setDragOverCategory(null);
  };

  const handleCategoryDragOver = (e: React.DragEvent, category: Category) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    
    if (draggedCategory && draggedCategory.id !== category.id) {
      setDragOverCategory(category);
    }
  };

  const handleCategoryDragLeave = (e: React.DragEvent) => {
    // 检查是否真的离开了元素
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      setDragOverCategory(null);
    }
  };

  const handleCategoryDrop = async (e: React.DragEvent, targetCategory: Category) => {
    e.preventDefault();
    
    if (!draggedCategory || draggedCategory.id === targetCategory.id) {
      setDragOverCategory(null);
      return;
    }

    // 本地更新顺序
    const newCategories = [...categories];
    const draggedIndex = newCategories.findIndex(c => c.id === draggedCategory.id);
    const targetIndex = newCategories.findIndex(c => c.id === targetCategory.id);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    // 移动元素
    newCategories.splice(draggedIndex, 1);
    newCategories.splice(targetIndex, 0, draggedCategory);
    
    // 更新本地状态
    setCategories(newCategories);
    setDraggedCategory(null);
    setDragOverCategory(null);

    // 构建排序数据
    const orders = newCategories.map((cat, index) => ({
      id: cat.id,
      order: index,
    }));

    // 保存到服务器
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/categories", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orders }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("排序已保存");
    } catch (error) {
      console.error("Save category order error:", error);
      toast.error("保存排序失败");
      // 恢复原始顺序
      fetchCategories();
    }
  };

  // 用户操作
  const openEditDialog = (user: UserWithPoints) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      avatar: user.avatar || "",
      role: user.role,
      is_verified: user.is_verified || false,
      is_active: user.is_active,
    });
    setEditDialogOpen(true);
  };

  // 头像上传处理
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }

    // 验证文件大小 (最大 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("图片大小不能超过 2MB");
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "avatar");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setEditForm({ ...editForm, avatar: data.url });
      toast.success("头像上传成功");
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast.error("头像上传失败");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: editingUser.id,
          updates: editForm,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("更新成功");
      setEditDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error("Update user error:", error);
      toast.error("更新失败");
    }
  };

  const handleDeleteUser = async (user: UserWithPoints) => {
    if (!confirm(`确定要禁用用户 ${user.name} 吗？`)) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/users?userId=${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("用户已禁用");
      fetchUsers();
    } catch (error) {
      console.error("Delete user error:", error);
      toast.error("操作失败");
    }
  };

  const openPointsDialog = (user: UserWithPoints) => {
    setGiftingUser(user);
    setGiftAmount("10");
    setGiftReason("");
    setPointsDialogOpen(true);
  };

  const handleGiftPoints = async () => {
    if (!giftingUser) return;

    const amount = parseInt(giftAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("请输入有效的积分数");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/points", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: giftingUser.user_id,
          amount,
          reason: giftReason || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success(data.message);
      setPointsDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error("Gift points error:", error);
      toast.error("赠送失败");
    }
  };

  // 文件操作
  const handleToggleFeatured = async (file: FileWithDetails) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/files", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileId: file.id,
          updates: { is_featured: !file.is_featured },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success(file.is_featured ? "已取消精选" : "已设为精选");
      fetchFiles();
    } catch (error) {
      console.error("Toggle featured error:", error);
      toast.error("操作失败");
    }
  };

  const handleDeleteFile = async (file: FileWithDetails) => {
    if (!confirm(`确定要删除文件 "${file.title}" 吗？`)) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/files?fileId=${file.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("文件已删除");
      fetchFiles();
    } catch (error) {
      console.error("Delete file error:", error);
      toast.error("删除失败");
    }
  };

  // 审核通过
  const handleApproveFile = async (file: FileWithDetails) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/files/approve", {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fileId: file.id, approved: true }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("审核通过，资料已上架");
      fetchFiles();
    } catch (error) {
      console.error("Approve file error:", error);
      toast.error("审核操作失败");
    }
  };

  // 审核拒绝
  const handleRejectFile = async (file: FileWithDetails) => {
    if (file.is_active) {
      toast.error("已审核文件不能删除");
      return;
    }

    const reason = prompt("请输入删除原因（可选）：");
    if (reason === null) return; // 用户取消

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/files/approve", {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fileId: file.id, approved: false, reason }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("已删除该资料");
      fetchFiles();
    } catch (error) {
      console.error("Reject file error:", error);
      toast.error("删除失败");
    }
  };

  // 批量审核通过
  const handleBatchApprove = async () => {
    if (selectedFiles.length === 0) {
      toast.error("请先选择需要审核的文件");
      return;
    }

    if (!confirm(`确定要批量审核通过 ${selectedFiles.length} 个文件吗？`)) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/files/approve", {
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fileIds: selectedFiles, approved: true }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success(`已批量审核通过 ${data.count} 个文件`);
      setSelectedFiles([]);
      fetchFiles();
    } catch (error) {
      console.error("Batch approve error:", error);
      toast.error("批量审核失败");
    }
  };

  const handleSelectFile = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.map(f => f.id));
    }
  };

  const handleBatchFeatured = async (featured: boolean) => {
    if (selectedFiles.length === 0) {
      toast.error("请先选择文件");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/files", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileIds: selectedFiles,
          updates: { is_featured: featured },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success(data.message);
      setSelectedFiles([]);
      fetchFiles();
    } catch (error) {
      console.error("Batch update error:", error);
      toast.error("批量操作失败");
    }
  };

  const handleBatchDelete = async () => {
    if (selectedFiles.length === 0) {
      toast.error("请先选择文件");
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedFiles.length} 个文件吗？此操作不可恢复！`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/files/batch-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileIds: selectedFiles }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success(data.message);
      setSelectedFiles([]);
      fetchFiles();
    } catch (error) {
      console.error("Batch delete error:", error);
      toast.error("批量删除失败");
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    
    // 显示上传中提示
    const toastId = toast.loading(`正在上传 ${filesArray.length} 个文件，AI正在智能分类...`);

    try {
      // 1. 先调用AI分类
      const fileNames = filesArray.map(f => f.name);
      const classifyResponse = await fetch("/api/files/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileNames }),
      });

      const classifyData = await classifyResponse.json();
      const categoryMap: Record<string, string> = {};
      
      if (classifyData.results) {
        classifyData.results.forEach((r: { fileName: string; category: string }) => {
          categoryMap[r.fileName] = r.category;
        });
      }

      // 2. 批量上传
      const formData = new FormData();
      filesArray.forEach(file => {
        formData.append("files", file);
      });
      formData.append("categoryMap", JSON.stringify(categoryMap));

      const token = localStorage.getItem("token");
      const uploadResponse = await fetch("/api/files/batch-upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadData.error);

      toast.success(`上传完成！成功 ${uploadData.uploaded} 个，失败 ${uploadData.failed} 个`, { id: toastId });
      setSelectedFiles([]);
      fetchFiles();
    } catch (error) {
      console.error("Batch upload error:", error);
      toast.error("批量上传失败", { id: toastId });
    }

    // 清空input
    e.target.value = "";
  };

  // 文件下载功能（用户端功能）
  const handleDownloadFile = useCallback(async (fileId: string, fileName: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("请先登录");
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
      fetchFiles();
    } catch (error) {
      console.error("Download error:", error);
      toast.error(error instanceof Error ? error.message : "下载失败");
    }
  }, [fetchFiles]);

  // 打开文件详情（用户端功能）
  const openFileDetail = useCallback((file: FileWithDetails) => {
    setSelectedFile(file);
    setDetailDialogOpen(true);
  }, []);

  const handlePreviewFile = async (file: FileWithDetails) => {
    setPreviewingFile(file);
    setPreviewDialogOpen(true);
  };

  // 打开修改分类对话框
  const openCategoryDialog = (file: FileWithDetails) => {
    setEditingCategoryFile(file);
    setSelectedCategoryId(file.category_id);
    setCategoryDialogOpen(true);
  };

  // 处理分类修改
  const handleUpdateCategory = async () => {
    if (!editingCategoryFile || !selectedCategoryId) {
      toast.error("请选择分类");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/files", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileId: editingCategoryFile.id,
          updates: { category_id: selectedCategoryId },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("分类修改成功");
      setCategoryDialogOpen(false);
      fetchFiles();
    } catch (error) {
      console.error("Update category error:", error);
      toast.error("修改分类失败");
    }
  };

  // 打开编辑标签对话框
  const openTagsDialog = (file: FileWithDetails) => {
    setEditingTagsFile(file);
    setEditingTags(file.tags || []);
    setNewTagInput("");
    setTagsDialogOpen(true);
  };

  // 添加标签
  const handleAddTag = () => {
    const tag = newTagInput.trim();
    if (!tag) return;
    if (editingTags.includes(tag)) {
      toast.error("标签已存在");
      return;
    }
    if (editingTags.length >= 10) {
      toast.error("最多添加10个标签");
      return;
    }
    if (tag.length > 50) {
      toast.error("标签长度不能超过50个字符");
      return;
    }
    setEditingTags([...editingTags, tag]);
    setNewTagInput("");
  };

  // 移除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setEditingTags(editingTags.filter(tag => tag !== tagToRemove));
  };

  // 保存标签
  const handleSaveTags = async () => {
    if (!editingTagsFile) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/files/tags", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileId: editingTagsFile.id,
          tags: editingTags,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("标签更新成功");
      setTagsDialogOpen(false);
      fetchFiles();
    } catch (error) {
      console.error("Update tags error:", error);
      toast.error("更新标签失败");
    }
  };

  // 打开 AI 审核对话框
  const openAiReviewDialog = async () => {
    setAiReviewDialogOpen(true);
    setAiReviewLoading(true);
    setAiReviewStep("select");
    setAiReviewFiles([]);
    setAiReviewStats(null);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/ai-classify", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setAiReviewFiles((data.files as Array<{
        id: string;
        title: string;
        fileName: string;
        fileType?: string;
        fileKey?: string;
        currentCategory: string;
        categoryId?: string;
        course?: string;
        description?: string;
      }>).map((f) => ({
        ...f,
        selected: true,
      })));
    } catch (error) {
      console.error("Failed to load files:", error);
      toast.error("加载文件列表失败");
      setAiReviewDialogOpen(false);
    } finally {
      setAiReviewLoading(false);
    }
  };

  // 执行 AI 审核
  const runAiReview = async () => {
    const selectedFiles = aiReviewFiles.filter(f => f.selected);
    if (selectedFiles.length === 0) {
      toast.error("请选择需要审核的文件");
      return;
    }

    setAiReviewAnalyzing(true);
    const toastId = toast.loading("AI 正在审核文件...");

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/ai-classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ files: selectedFiles }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // 保存统计信息
      setAiReviewStats(data.stats);

      const results = data.results as Array<{
        id: string;
        compliant: boolean;
        complianceIssue: string | null;
        categoryCorrect: boolean;
        suggestedCategory: string | null;
        suggestedCategoryId: string | null;
        optimizedTitle: string;
        titleChanged: boolean;
        reason?: string | null;
      }>;
      const resultMap = new Map(results.map((r) => [r.id, r]));
      const failedIds = new Set((data.failedIds as string[] | undefined) || []);

      // 保留原始文件信息，叠加审核结果；失败项也保留，避免“消失”
      setAiReviewFiles(selectedFiles.map((file) => {
        const matched = resultMap.get(file.id);
        if (matched) {
          return {
            ...file,
            ...matched,
            selected: matched.compliant,
            reviewError: null,
          };
        }

        if (failedIds.has(file.id)) {
          return {
            ...file,
            reviewError: "AI 审核失败，请重试",
            selected: false,
            compliant: false,
            complianceIssue: "AI 审核失败，请重试",
            categoryCorrect: false,
            suggestedCategory: null,
            suggestedCategoryId: null,
            optimizedTitle: file.title,
            titleChanged: false,
          };
        }

        return {
          ...file,
          reviewError: "AI 审核结果缺失",
          selected: false,
          compliant: false,
          complianceIssue: "AI 审核结果缺失",
          categoryCorrect: false,
          suggestedCategory: null,
          suggestedCategoryId: null,
          optimizedTitle: file.title,
          titleChanged: false,
        };
      }));
      
      // 始终进入审核结果页面，让用户确认
      setAiReviewStep("review");
      
      // 构建提示消息
      const messages = [];
      if (data.stats.nonCompliant > 0) {
        messages.push(`${data.stats.nonCompliant} 个不合规`);
      }
      if (data.stats.categoryNeedFix > 0) {
        messages.push(`${data.stats.categoryNeedFix} 个分类需修正`);
      }
      if (data.stats.titleNeedOptimize > 0) {
        messages.push(`${data.stats.titleNeedOptimize} 个标题可优化`);
      }
      if (data.stats.failed > 0) {
        messages.push(`${data.stats.failed} 个审核失败`);
      }
      
      // 显示处理方式
      const processInfo = `（Kimi 并行审核 ${data.stats.llmProcessed} 个，文本提取 ${data.stats.contentExtracted} 个，分批 ${data.stats.batches} 批）`;
      
      if (messages.length === 0) {
        toast.success(`审核完成：全部 ${data.stats.total} 个文件均无问题 ${processInfo}`, { id: toastId });
      } else {
        toast.success(`审核完成：发现 ${messages.join("，")} ${processInfo}`, { id: toastId });
      }

      if (data.stats.failed > 0) {
        toast.warning(`有 ${data.stats.failed} 个文件审核失败，已保留原始信息`, { id: toastId });
      }
      
      fetchFiles();
    } catch (error) {
      console.error("AI review error:", error);
      toast.error("AI 审核失败", { id: toastId });
    } finally {
      setAiReviewAnalyzing(false);
    }
  };

  // 确认并执行修改
  const confirmAiReview = async () => {
    // 获取需要修改的文件（不合规的不修改，只标记）
    const filesToChange = aiReviewFiles.filter(f => 
      f.selected && !f.reviewError && f.compliant && (f.suggestedCategoryId || (f.optimizedTitle && f.titleChanged))
    );
    const filesToPublish = aiReviewFiles.filter(f => f.selected && !f.reviewError && f.compliant);
    
    const nonCompliantFiles = aiReviewFiles.filter(f => !f.reviewError && !f.compliant);
    
    // 所有审核过的文件ID
    const allReviewedIds = aiReviewFiles.filter(f => !f.reviewError).map(f => f.id);

    setAiReviewAnalyzing(true);
    const toastId = toast.loading(
      filesToChange.length > 0
        ? `正在处理 ${filesToChange.length} 个文件并自动上架...`
        : filesToPublish.length > 0
          ? `正在自动上架 ${filesToPublish.length} 个文件...`
          : "正在标记已审核..."
    );

    try {
      const token = localStorage.getItem("token");
      
      // 执行修改
      const response = await fetch("/api/admin/ai-classify", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          changes: filesToChange,
          allReviewedIds,
          publishIds: filesToPublish.map(f => f.id),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // 如果有不合规文件，提示用户
      if (nonCompliantFiles.length > 0) {
        toast.success(`已处理 ${data.stats.success} 个文件。注意：有 ${nonCompliantFiles.length} 个不合规文件需要人工处理`, { id: toastId });
      } else {
        toast.success(data.message, { id: toastId });
      }
      
      setAiReviewStep("confirm");
      fetchFiles();
    } catch (error) {
      console.error("Confirm changes error:", error);
      toast.error("确认修改失败", { id: toastId });
    } finally {
      setAiReviewAnalyzing(false);
    }
  };

  // 切换文件选中状态
  const toggleFileSelection = (id: string) => {
    setAiReviewFiles(prev => prev.map(f => 
      f.id === id ? { ...f, selected: !f.selected } : f
    ));
  };

  const updateAiReviewTitle = (id: string, nextTitle: string) => {
    const normalized = nextTitle.replace(/\s+/g, " ").trim();
    setAiReviewFiles(prev => prev.map(f =>
      f.id === id
        ? normalized.length > 0
          ? {
              ...f,
              optimizedTitle: normalized,
              titleChanged: normalized !== f.title.trim(),
              selected: true,
            }
          : {
              ...f,
              selected: true,
            }
        : f
    ));
  };

  // 全选/取消全选
  const selectAllFiles = () => {
    const reviewableFiles = aiReviewFiles.filter(f => !f.reviewError);
    const allSelected = reviewableFiles.length > 0 && reviewableFiles.every(f => f.selected);
    setAiReviewFiles(prev => prev.map(f => 
      f.reviewError ? f : { ...f, selected: !allSelected }
    ));
  };

  // 删除不合规文件
  const deleteNonCompliantFile = async (fileId: string, fileName: string) => {
    if (!confirm(`确定要删除不合规文件 "${fileName}" 吗？此操作不可恢复。`)) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/files?fileId=${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("不合规文件已删除");
      
      // 从列表中移除已删除的文件
      setAiReviewFiles(prev => prev.filter(f => f.id !== fileId));
      
      // 更新统计数据
      if (aiReviewStats) {
        setAiReviewStats({
          ...aiReviewStats,
          total: aiReviewStats.total - 1,
          nonCompliant: aiReviewStats.nonCompliant - 1,
        });
      }
    } catch (error) {
      console.error("Delete file error:", error);
      toast.error("删除失败");
    }
  };

  // 批量删除所有不合规文件
  const deleteAllNonCompliantFiles = async () => {
    const nonCompliantFiles = aiReviewFiles.filter(f => !f.compliant);
    if (nonCompliantFiles.length === 0) return;
    
    if (!confirm(`确定要删除 ${nonCompliantFiles.length} 个不合规文件吗？此操作不可恢复。`)) return;

    try {
      const token = localStorage.getItem("token");
      let successCount = 0;
      let failCount = 0;

      for (const file of nonCompliantFiles) {
        const response = await fetch(`/api/admin/files?fileId=${file.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`已删除 ${successCount} 个不合规文件`);
        // 从列表中移除已删除的文件
        setAiReviewFiles(prev => prev.filter(f => f.compliant));
        
        // 更新统计数据
        if (aiReviewStats) {
          setAiReviewStats({
            ...aiReviewStats,
            total: aiReviewStats.total - successCount,
            nonCompliant: 0,
          });
        }
      }
      
      if (failCount > 0) {
        toast.error(`${failCount} 个文件删除失败`);
      }
    } catch (error) {
      console.error("Batch delete error:", error);
      toast.error("批量删除失败");
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-100 text-red-700 border-red-200">管理员</Badge>;
      case "volunteer":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">志愿者</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">普通用户</Badge>;
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || "未分类";
  };

  if (authLoading || !isVolunteer) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="glass-header sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <button className="glass-button p-2.5 rounded-lg">
                  <ArrowLeft className="w-5 h-5 text-[#475569]" />
                </button>
              </Link>
              <h1 className="text-2xl font-bold tracking-tight">
                <span className="text-[#005BA3]">管理</span>
                <span className="text-[#64748B]">后台</span>
              </h1>
            </div>

            <Badge className="bg-[#F0F7FF] text-[#005BA3] border-[#E2E8F0] px-3 py-1 text-sm font-medium">
              {isAdmin ? "管理员权限" : "志愿者权限"}
            </Badge>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="container mx-auto px-6 pt-6">
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { key: "stats", label: "数据统计", icon: Star },
            { key: "analytics", label: "流量统计", icon: Eye },
            { key: "files", label: "资料管理", icon: FileText },
            { key: "users", label: "用户管理", icon: Users },
            { key: "categories", label: "分类管理", icon: Settings },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-[#005BA3] text-white"
                  : "bg-white text-[#64748B] hover:bg-[#F0F7FF]"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="container mx-auto px-6 pb-8">
        {/* Stats Tab */}
        {activeTab === "stats" && (
          <>
            {/* 统计卡片 + 系统信息并排显示 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
              {/* 左侧：核心统计 */}
              <div className="lg:col-span-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { title: "总资料数", value: stats.totalFiles, icon: FileText, color: "#005BA3" },
                    { title: "总下载量", value: stats.totalDownloads, icon: Download, color: "#059669" },
                    { title: "总评分数", value: stats.totalRatings, icon: Star, color: "#D97706" },
                    { title: "用户数", value: stats.totalUsers, icon: Users, color: "#7C3AED" },
                  ].map((stat) => (
                    <div key={stat.title} className="neu-card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#64748B]">{stat.title}</span>
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: stat.color }}
                        >
                          <stat.icon className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-[#1E293B]">{stat.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-[#94A3B8]">
                  统计数据最近自动更新：{statsUpdatedAt ? new Date(statsUpdatedAt).toLocaleString("zh-CN") : "加载中"}
                </div>
              </div>

              {/* 右侧：系统状态 */}
              <div className="neu-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#1E293B]">系统状态</h3>
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    运行正常
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "运行环境", value: "Next.js 16", icon: Server },
                    { label: "存储服务", value: "腾讯云 COS", icon: HardDrive },
                    { label: "AI 服务", value: "LLM 智能分类", icon: Sparkles },
                    { label: "数据库", value: "PostgreSQL", icon: Server },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9] last:border-0">
                      <div className="flex items-center gap-2">
                        <item.icon className="w-3.5 h-3.5 text-[#94A3B8]" />
                        <span className="text-xs text-[#64748B]">{item.label}</span>
                      </div>
                      <span className="text-xs font-medium text-[#1E293B]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 积分规则 + 实用链接并排显示 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              {/* 积分规则 */}
              <div className="glass-card p-5">
                <h2 className="text-base font-semibold text-[#1E293B] mb-3">积分规则</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "注册奖励", value: "+20", color: "text-green-600" },
                    { label: "上传资料", value: "+10", color: "text-green-600" },
                    { label: "下载资料", value: "-5", color: "text-red-500" },
                    { label: "周排名前5", value: "+50", color: "text-green-600" },
                    { label: "精选资料", value: "+30", color: "text-green-600" },
                    { label: "管理员赠送", value: "∞", color: "text-[#005BA3]" },
                  ].map((rule) => (
                    <div key={rule.label} className="flex items-center justify-between p-2.5 bg-[#F8FAFC] rounded-lg">
                      <span className="text-sm text-[#64748B]">{rule.label}</span>
                      <span className={`text-sm font-bold ${rule.color}`}>{rule.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 实用链接 */}
              <div className="glass-card p-5">
                <h2 className="text-base font-semibold text-[#1E293B] mb-3">开发者资源</h2>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: "MDN", url: "https://developer.mozilla.org/", desc: "Web文档" },
                    { name: "GitHub", url: "https://github.com/", desc: "代码托管" },
                    { name: "Stack Overflow", url: "https://stackoverflow.com/", desc: "技术问答" },
                    { name: "Can I Use", url: "https://caniuse.com/", desc: "兼容性" },
                    { name: "NPM", url: "https://www.npmjs.com/", desc: "包管理" },
                    { name: "Tailwind", url: "https://tailwindcss.com/", desc: "CSS框架" },
                  ].map((link) => (
                    <a
                      key={link.name}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 bg-[#F8FAFC] rounded-lg hover:bg-[#F0F7FF] border border-transparent hover:border-[#005BA3]/20 transition-all group text-center"
                    >
                      <span className="text-sm font-medium text-[#1E293B] group-hover:text-[#005BA3] block">{link.name}</span>
                      <span className="text-[10px] text-[#94A3B8]">{link.desc}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <>
            {/* 时间范围选择 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                {[
                  { value: "7days", label: "近7天" },
                  { value: "30days", label: "近30天" },
                  { value: "90days", label: "近90天" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setAnalyticsPeriod(option.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      analyticsPeriod === option.value
                        ? "bg-[#005BA3] text-white"
                        : "bg-white text-[#64748B] hover:bg-[#F0F7FF]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button
                onClick={exportAnalyticsReport}
                disabled={!analyticsData || analyticsLoading}
                className="bg-[#005BA3] hover:bg-[#004A8C] flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                导出报告
              </Button>
            </div>

            {analyticsLoading ? (
              <div className="flex items-center justify-center h-[400px]">
                <div className="animate-spin w-8 h-8 border-2 border-[#005BA3] border-t-transparent rounded-full" />
              </div>
            ) : analyticsData ? (
              <>
                {/* 概览卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                  <div className="neu-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[#64748B]">总访问量</span>
                      <div className="w-9 h-9 rounded-lg bg-[#005BA3] flex items-center justify-center">
                        <Eye className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-[#1E293B]">
                      {analyticsData.summary.totalViews.toLocaleString()}
                    </div>
                    <div className={`text-sm mt-1 ${parseFloat(analyticsData.summary.viewsGrowth) >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {parseFloat(analyticsData.summary.viewsGrowth) >= 0 ? "↑" : "↓"} {Math.abs(parseFloat(analyticsData.summary.viewsGrowth))}% 较前一期
                    </div>
                  </div>
                  <div className="neu-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[#64748B]">独立访客</span>
                      <div className="w-9 h-9 rounded-lg bg-[#059669] flex items-center justify-center">
                        <Users className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-[#1E293B]">
                      {analyticsData.summary.uniqueVisitors.toLocaleString()}
                    </div>
                    <div className="text-sm text-[#94A3B8] mt-1">唯一IP数量</div>
                  </div>
                  <div className="neu-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[#64748B]">日均访问</span>
                      <div className="w-9 h-9 rounded-lg bg-[#D97706] flex items-center justify-center">
                        <Download className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-[#1E293B]">
                      {analyticsData.summary.avgViewsPerDay.toLocaleString()}
                    </div>
                    <div className="text-sm text-[#94A3B8] mt-1">次/天</div>
                  </div>
                  <div className="neu-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[#64748B]">访问趋势</span>
                      <div className="w-9 h-9 rounded-lg bg-[#7C3AED] flex items-center justify-center">
                        <Star className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-[#1E293B]">
                      {analyticsData.summary.viewsGrowth}%
                    </div>
                    <div className="text-sm text-[#94A3B8] mt-1">环比变化</div>
                  </div>
                </div>

                {/* 访问趋势图表 */}
                <div className="glass-card p-6 mb-8">
                  <h2 className="text-lg font-semibold text-[#1E293B] mb-4">访问趋势</h2>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analyticsData.dailyStats}>
                        <defs>
                          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#005BA3" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#005BA3" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#94A3B8"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => value.slice(5)}
                        />
                        <YAxis stroke="#94A3B8" tick={{ fontSize: 12 }} />
                        <Tooltip 
                          contentStyle={{ 
                            background: 'white', 
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                          }}
                          labelFormatter={(label) => label}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="views" 
                          stroke="#005BA3" 
                          strokeWidth={2}
                          fill="url(#colorViews)"
                          name="访问量"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 页面类型统计 */}
                  <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-[#1E293B] mb-4">页面类型分布</h2>
                    <div className="space-y-3">
                      {Object.entries(analyticsData.pageTypeStats)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => {
                          const total = Object.values(analyticsData.pageTypeStats).reduce((a, b) => a + b, 0);
                          const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
                          const typeLabels: Record<string, string> = {
                            home: "首页",
                            file_detail: "文件详情",
                            download: "下载页",
                            profile: "个人中心",
                            rankings: "排行榜",
                            search: "搜索页",
                            admin: "管理后台",
                            page: "其他页面",
                            event: "事件追踪",
                          };
                          return (
                            <div key={type} className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm text-[#475569]">
                                    {typeLabels[type] || type}
                                  </span>
                                  <span className="text-sm font-medium text-[#1E293B]">
                                    {count.toLocaleString()} ({percentage}%)
                                  </span>
                                </div>
                                <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-[#005BA3] rounded-full transition-all"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* 热门页面 */}
                  <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-[#1E293B] mb-4">热门页面 TOP 10</h2>
                    <div className="space-y-2">
                      {analyticsData.topPages.map((page, index) => (
                        <div key={page.path} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F8FAFC]">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index < 3 ? "bg-[#005BA3] text-white" : "bg-[#E2E8F0] text-[#64748B]"
                          }`}>
                            {index + 1}
                          </span>
                          <span className="flex-1 text-sm text-[#475569] truncate">
                            {page.path === "/" ? "首页" : page.path}
                          </span>
                          <span className="text-sm font-medium text-[#005BA3]">
                            {page.count.toLocaleString()}
                          </span>
                        </div>
                      ))}
                      {analyticsData.topPages.length === 0 && (
                        <div className="text-center py-8 text-[#94A3B8]">
                          暂无数据
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-[#94A3B8]">
                暂无流量数据
              </div>
            )}
          </>
        )}

        {/* Files Tab */}
        {activeTab === "files" && (
          <div className="glass-card p-6">
            {/* 工具栏 - 响应式设计 */}
            <div className="mb-6">
              {/* 第一行：搜索框 + 主要操作按钮 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                {/* 左侧：搜索 */}
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <Input
                      placeholder="搜索资料标题..."
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFileSearch()}
                      className="bg-white pl-10 h-10"
                    />
                  </div>
                  <Button onClick={handleFileSearch} className="bg-[#005BA3] hover:bg-[#004A8C] h-10 px-4 shrink-0">
                    搜索
                  </Button>
                </div>
                
                {/* 右侧：主要操作 */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* AI 审核 */}
                  <button
                    onClick={openAiReviewDialog}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all shadow-sm text-xs sm:text-sm font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>AI 审核</span>
                  </button>

                  {/* 上传按钮 */}
                  <button
                    onClick={() => setUploadDialogOpen(true)}
                    className="neu-button-primary flex items-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 text-xs sm:text-sm"
                  >
                    <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>上传资料</span>
                  </button>
                </div>
              </div>
              
              {/* 第二行：筛选器 - 可折叠 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[#94A3B8] hidden sm:inline">筛选：</span>
                <Select value={fileCategoryFilter} onValueChange={setFileCategoryFilter}>
                  <SelectTrigger className="w-[110px] sm:w-[130px] h-8 text-xs bg-white border-[#E2E8F0]">
                    <SelectValue placeholder="分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部分类</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[100px] sm:w-[110px] h-8 text-xs bg-white border-[#E2E8F0]">
                    <SelectValue placeholder="排序" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">最新上传</SelectItem>
                    <SelectItem value="download_count">下载最多</SelectItem>
                    <SelectItem value="average_rating">评分最高</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 批量操作栏 - 响应式设计 */}
            <div className="mb-4 p-3 sm:p-4 bg-gradient-to-r from-[#F8FAFC] to-white rounded-xl border border-[#E2E8F0]">
              {/* 主行：选择状态 + 筛选器 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* 左侧：选择状态 */}
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedFiles.length > 0 
                      ? "bg-[#005BA3] text-white" 
                      : "bg-[#F1F5F9] text-[#94A3B8]"
                  }`}>
                    <CheckCircle className="w-4 h-4" />
                    <span>{selectedFiles.length > 0 ? `已选 ${selectedFiles.length} 项` : "未选择"}</span>
                  </div>
                  
                  {/* 快速筛选 - 移动端下拉，桌面端平铺 */}
                  <div className="flex sm:hidden items-center gap-2 ml-auto">
                    <Select value={fileStatusFilter} onValueChange={setFileStatusFilter}>
                      <SelectTrigger className="w-[100px] h-8 text-xs bg-white">
                        <SelectValue placeholder="状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部状态</SelectItem>
                        <SelectItem value="true">已上架</SelectItem>
                        <SelectItem value="false">待审核</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* 右侧：筛选器 - 桌面端显示 */}
                <div className="hidden sm:flex items-center gap-2">
                  <Select value={fileFeaturedFilter} onValueChange={setFileFeaturedFilter}>
                    <SelectTrigger className="w-[90px] h-8 text-xs bg-white border-[#E2E8F0]">
                      <SelectValue placeholder="精选" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="true">已精选</SelectItem>
                      <SelectItem value="false">未精选</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={fileStatusFilter} onValueChange={setFileStatusFilter}>
                    <SelectTrigger className="w-[100px] h-8 text-xs bg-white border-[#E2E8F0]">
                      <SelectValue placeholder="上架状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="true">已上架</SelectItem>
                      <SelectItem value="false">待审核</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={aiStatusFilter} onValueChange={setAiStatusFilter}>
                    <SelectTrigger className="w-[100px] h-8 text-xs bg-white border-[#E2E8F0]">
                      <SelectValue placeholder="AI审核" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="reviewed">已审核</SelectItem>
                      <SelectItem value="pending">未审核</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* 批量操作按钮 - 仅选中时显示 */}
              {selectedFiles.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#E2E8F0]">
                  {/* 移动端：两行布局 */}
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    <Button 
                      size="sm" 
                      onClick={handleBatchApprove} 
                      className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm h-8 sm:h-9"
                    >
                      <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />
                      <span className="hidden sm:inline">批量</span>通过
                    </Button>
                    <div className="hidden sm:block w-px h-6 bg-[#E2E8F0] self-center" />
                    <Button 
                      size="sm" 
                      onClick={() => handleBatchFeatured(true)} 
                      className="bg-[#005BA3] hover:bg-[#004A8C] text-xs sm:text-sm h-8 sm:h-9"
                    >
                      <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />
                      <span className="hidden sm:inline">批量</span>精选
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleBatchFeatured(false)}
                      className="text-xs sm:text-sm h-8 sm:h-9"
                    >
                      取消精选
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={handleBatchDelete}
                      className="text-xs sm:text-sm h-8 sm:h-9"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />
                      <span className="hidden sm:inline">批量</span>删除
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setSelectedFiles([])}
                      className="ml-auto text-xs sm:text-sm h-8 sm:h-9 text-[#64748B]"
                    >
                      取消选择
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Files List - 响应式表格/卡片布局 */}
            <div className="space-y-3">
              {/* 表头 - 仅桌面端显示 */}
              <div className="hidden lg:grid grid-cols-[auto_minmax(0,1.15fr)_170px_110px_110px_170px_110px_180px] gap-3 px-4 py-2 bg-[#F8FAFC] rounded-lg text-sm font-medium text-[#64748B]">
                <div className="w-4">
                  <input
                    type="checkbox"
                    checked={selectedFiles.length === files.length && files.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-[#E2E8F0]"
                  />
                </div>
                <div>资料信息</div>
                <div>分类/课程</div>
                <div>上传者</div>
                <div>数据</div>
                <div>状态</div>
                <div>上传时间</div>
                <div className="text-right">操作</div>
              </div>
              
              {/* 文件列表 */}
              {files.map((file) => (
                <div 
                  key={file.id} 
                  className="group border border-[#E2E8F0] rounded-xl hover:border-[#005BA3] hover:shadow-md transition-all bg-white overflow-hidden"
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "132px",
                  }}
                >
                  {/* 移动端卡片布局 */}
                  <div className="lg:hidden p-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.id)}
                        onChange={() => handleSelectFile(file.id)}
                        className="w-4 h-4 rounded border-[#E2E8F0] mt-1"
                      />
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[#F0F7FF] to-[#E0F0FF] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {file.preview_url ? (
                          <img src={file.preview_url} alt={file.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ 
                              backgroundColor: {
                                pdf: "#EF4444", doc: "#3B82F6", docx: "#3B82F6",
                                ppt: "#F97316", pptx: "#F97316", xls: "#22C55E", xlsx: "#22C55E",
                                zip: "#8B5CF6", rar: "#8B5CF6",
                              }[file.file_type.toLowerCase()] || "#005BA3"
                            }}
                          >
                            <FileText className="w-5 h-5 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#1E293B] truncate" title={file.title}>{file.title}</div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-[#94A3B8]">
                          <span>{formatFileSize(file.file_size)}</span>
                          <span>·</span>
                          <span>{file.file_type.toUpperCase()}</span>
                          <span>·</span>
                          <span>{formatDate(file.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* 标签行 */}
                    <div className="flex items-center gap-1.5 mt-3 ml-7 flex-wrap">
                      <Badge variant="secondary" className="bg-[#F0F7FF] text-[#005BA3] text-xs whitespace-nowrap">
                        {file.categories?.name || getCategoryName(file.category_id)}
                      </Badge>
                      <Badge className={file.is_active ? "bg-green-100 text-green-700 text-xs whitespace-nowrap" : "bg-red-100 text-red-700 text-xs whitespace-nowrap"}>
                        {file.is_active ? "已审核" : "待审核"}
                      </Badge>
                      {file.ai_classified_at && (
                        <span className="inline-flex items-center rounded-full border border-purple-100 bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-500 whitespace-nowrap">
                          AI
                        </span>
                      )}
                      {file.is_featured && (
                        <Badge className="bg-amber-100 text-amber-700 text-xs whitespace-nowrap">
                          <Award className="w-3 h-3 mr-1" />精选
                        </Badge>
                      )}
                    </div>
                    
                    {/* 数据行 */}
                    <div className="flex items-center gap-4 mt-3 ml-7 text-xs text-[#64748B]">
                      <div className="flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" />
                        {file.download_count}
                      </div>
                      <div className="flex items-center gap-1 text-[#D97706]">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {parseFloat(file.average_rating).toFixed(1)}
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="w-3.5 h-3.5" />
                        {file.comment_count || 0}
                      </div>
                      <div className="ml-auto text-[#64748B]">{file.profiles?.name || "未知"}</div>
                    </div>
                    
                    {/* 操作按钮行 */}
                    <div className="flex items-center gap-2 mt-3 ml-7 pt-3 border-t border-[#F1F5F9]">
                      {!file.is_active && (
                        <>
                          <button onClick={() => handleApproveFile(file)} className="flex-1 py-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium transition-colors">
                            <CheckCircle className="w-3.5 h-3.5 inline mr-1" />通过
                          </button>
                          <button onClick={() => handleRejectFile(file)} className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium transition-colors">
                            <XCircle className="w-3.5 h-3.5 inline mr-1" />删除
                          </button>
                        </>
                      )}
                      <button onClick={() => handleToggleFeatured(file)} className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                        file.is_featured ? "bg-amber-50 text-amber-600" : "bg-[#F0F7FF] text-[#005BA3]"
                      }`}>
                        <Award className="w-3.5 h-3.5 inline mr-1" />{file.is_featured ? "取消精选" : "精选"}
                      </button>
                      <button onClick={() => handlePreviewFile(file)} className="py-2 px-3 rounded-lg bg-[#F0F7FF] text-[#005BA3] text-xs font-medium hover:bg-[#E0F0FF] transition-colors">
                        <Eye className="w-3.5 h-3.5 inline mr-1" />预览
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleDeleteFile(file)} className="py-2 px-3 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* 桌面端表格布局 */}
                  <div className="hidden lg:grid grid-cols-[auto_minmax(0,1.15fr)_170px_110px_110px_170px_110px_180px] gap-3 items-center px-4 py-3">
                    <div className="w-4">
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.id)}
                        onChange={() => handleSelectFile(file.id)}
                        className="w-4 h-4 rounded border-[#E2E8F0]"
                      />
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-[#F0F7FF] to-[#E0F0FF] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {file.preview_url ? (
                          <img src={file.preview_url} alt={file.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div 
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ 
                              backgroundColor: {
                                pdf: "#EF4444", doc: "#3B82F6", docx: "#3B82F6",
                                ppt: "#F97316", pptx: "#F97316", xls: "#22C55E", xlsx: "#22C55E",
                                zip: "#8B5CF6", rar: "#8B5CF6",
                              }[file.file_type.toLowerCase()] || "#005BA3"
                            }}
                          >
                            <FileText className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[#1E293B] truncate text-sm" title={file.title}>{file.title}</div>
                        <div className="text-xs text-[#94A3B8] flex items-center gap-2 mt-0.5">
                          <HardDrive className="w-3 h-3" />
                          {formatFileSize(file.file_size)}
                          <span className="text-[#CBD5E1]">|</span>
                          {file.file_type.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <Badge variant="secondary" className="bg-[#F0F7FF] text-[#005BA3] text-xs">
                        {file.categories?.name || getCategoryName(file.category_id)}
                      </Badge>
                      {file.course && <div className="text-xs text-[#64748B] mt-1 truncate">{file.course}</div>}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-[#475569] truncate max-w-[7rem] lg:max-w-[6.5rem]">
                        {file.profiles?.name || "未知"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex items-center gap-1 text-[#475569]">
                        <Download className="w-3 h-3" />{file.download_count}
                      </div>
                      <div className="flex items-center gap-1 text-[#D97706]">
                        <Star className="w-3 h-3 fill-current" />{parseFloat(file.average_rating).toFixed(1)}
                      </div>
                    </div>
                    <div className="flex flex-row items-center gap-1 flex-nowrap min-w-0">
                      <Badge className={file.is_active ? "bg-green-100 text-green-700 text-[10px] w-fit whitespace-nowrap px-2 py-0.5 shrink-0" : "bg-red-100 text-red-700 text-[10px] w-fit whitespace-nowrap px-2 py-0.5 shrink-0"}>
                        {file.is_active ? "已审核" : "待审核"}
                      </Badge>
                      {file.ai_classified_at && (
                        <span className="inline-flex items-center rounded-full border border-purple-100 bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-500 w-fit whitespace-nowrap shrink-0">
                          AI
                        </span>
                      )}
                      {file.is_featured && (
                        <Badge className="bg-amber-100 text-amber-700 text-[10px] w-fit whitespace-nowrap px-2 py-0.5 shrink-0">
                          <Award className="w-2.5 h-2.5 mr-0.5" />精选
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-[#64748B]">
                      {formatDate(file.created_at)}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {!file.is_active && (
                        <>
                          <button onClick={() => handleApproveFile(file)} className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="通过">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleRejectFile(file)} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors" title="删除">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button onClick={() => handleToggleFeatured(file)} className={`p-1.5 rounded-lg transition-colors ${
                        file.is_featured ? "bg-amber-50 text-amber-600" : "bg-[#F0F7FF] text-[#005BA3]"
                      }`} title={file.is_featured ? "取消精选" : "精选"}>
                        <Award className="w-4 h-4" />
                      </button>
                      <button onClick={() => handlePreviewFile(file)} className="p-1.5 rounded-lg bg-[#F0F7FF] text-[#005BA3] hover:bg-[#E0F0FF] transition-colors" title="预览">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openCategoryDialog(file)} className="p-1.5 rounded-lg bg-[#F0F7FF] text-[#005BA3] hover:bg-[#E0F0FF] transition-colors" title="修改分类">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleDeleteFile(file)} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors" title="删除">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {files.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-[#64748B]">暂无资料数据</p>
                </div>
              )}
            </div>

            {/* Pagination */}
              <Pagination
              currentPage={filePagination.page}
              totalPages={filePagination.totalPages}
              total={filePagination.total}
              onPageChange={(page) => fetchFiles(page)}
              showTotal={true}
              showQuickJumper={true}
              pageSize={filePagination.limit}
            />
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="glass-card p-6">
            {/* Search & Filter */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="flex-1 min-w-[200px] max-w-md flex gap-2">
                <Input
                  placeholder="搜索用户名、邮箱、学号..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUserSearch()}
                  className="bg-white"
                />
                <Button onClick={handleUserSearch} className="bg-[#005BA3] hover:bg-[#004A8C] shrink-0">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[140px] bg-white">
                  <SelectValue placeholder="全部角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="volunteer">志愿者</SelectItem>
                  <SelectItem value="guest">普通用户</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0]">
                    <th className="text-left py-3 px-4 font-medium text-[#64748B]">用户</th>
                    <th className="text-left py-3 px-4 font-medium text-[#64748B]">角色</th>
                    <th className="text-left py-3 px-4 font-medium text-[#64748B]">积分</th>
                    <th className="text-left py-3 px-4 font-medium text-[#64748B]">状态</th>
                    <th className="text-left py-3 px-4 font-medium text-[#64748B]">注册时间</th>
                    <th className="text-right py-3 px-4 font-medium text-[#64748B]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#005BA3] flex items-center justify-center overflow-hidden">
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-[#1E293B]">{user.name}</div>
                            <div className="text-xs text-[#94A3B8]">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">{getRoleBadge(user.role)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 font-semibold text-[#005BA3]">
                          <Coins className="w-4 h-4" />
                          {user.points}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {user.is_active ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">正常</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-red-200">已禁用</Badge>
                        )}
                        {user.is_verified && (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 ml-1">已认证</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#64748B] text-sm">{formatDate(user.created_at)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openPointsDialog(user)}
                            className="p-2 rounded-lg bg-[#F0F7FF] text-[#005BA3] hover:bg-[#E0F0FF] transition-colors"
                            title="赠送积分"
                          >
                            <Coins className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => openEditDialog(user)}
                                className="p-2 rounded-lg bg-[#F0F7FF] text-[#475569] hover:bg-[#E0F0FF] transition-colors"
                                title="编辑用户"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user)}
                                className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                title="禁用用户"
                                disabled={user.role === "admin"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {users.length === 0 && (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-[#64748B]">暂无用户数据</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={userPagination.page}
              totalPages={userPagination.totalPages}
              total={userPagination.total}
              onPageChange={(page) => setUserPagination(prev => ({ ...prev, page }))}
              showTotal={true}
              showQuickJumper={true}
              pageSize={userPagination.limit}
            />
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === "categories" && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-[#1E293B] flex items-center gap-2">
                  <Settings className="w-5 h-5 text-[#005BA3]" />
                  分类管理
                </h2>
                <p className="text-sm text-[#64748B] mt-1">管理文件分类，拖动卡片可调整排序</p>
              </div>
              <button onClick={handleCreateCategory} className="neu-button-primary flex items-center gap-2">
                <FolderPlus className="w-4 h-4" />
                新建分类
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category, index) => (
                <div 
                  key={category.id} 
                  className={`neu-card p-4 hover-lift cursor-move transition-all duration-200 ${
                    dragOverCategory?.id === category.id ? "ring-2 ring-[#005BA3] ring-offset-2 scale-105" : ""
                  } ${draggedCategory?.id === category.id ? "opacity-50" : ""}`}
                  draggable
                  onDragStart={(e) => handleCategoryDragStart(e, category)}
                  onDragEnd={handleCategoryDragEnd}
                  onDragOver={(e) => handleCategoryDragOver(e, category)}
                  onDragLeave={handleCategoryDragLeave}
                  onDrop={(e) => handleCategoryDrop(e, category)}
                >
                  {/* 第一行：拖拽手柄 + 图标 + 分类名称 + 操作按钮 */}
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 text-[#94A3B8] hover:text-[#64748B] cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-[#005BA3] flex items-center justify-center flex-shrink-0">
                      <FolderPlus className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[#1E293B] truncate text-base">{category.name}</div>
                      <div className="text-xs text-[#94A3B8] truncate">{category.slug || "-"}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditCategory(category);
                        }}
                        className="p-2 rounded-lg hover:bg-[#F0F7FF] text-[#64748B] hover:text-[#005BA3] transition-colors"
                        title="编辑分类"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(category);
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          (categoryFileCounts[category.id] ?? 0) > 0
                            ? "text-[#CBD5E1] cursor-not-allowed"
                            : "hover:bg-red-50 text-[#94A3B8] hover:text-red-500"
                        }`}
                        title={(categoryFileCounts[category.id] ?? 0) > 0 ? "分类下有文件，无法删除" : "删除分类"}
                        disabled={(categoryFileCounts[category.id] ?? 0) > 0}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {/* 第二行：文件数量 + 排序编号 */}
                  <div className="flex items-center gap-2 mt-3 pl-[4.5rem]">
                    <Badge variant="secondary" className="bg-[#F0F7FF] text-[#005BA3] text-xs">
                      {categoryFileCounts[category.id] ?? 0} 个文件
                    </Badge>
                    <Badge variant="outline" className="text-[#94A3B8] text-xs">
                      #{index + 1}
                    </Badge>
                  </div>
                </div>
              ))}

              {categories.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <div className="w-14 h-14 rounded-full bg-[#F1F5F9] flex items-center justify-center mx-auto mb-3">
                    <Settings className="w-7 h-7 text-[#005BA3]" />
                  </div>
                  <p className="text-[#475569] font-medium">暂无分类</p>
                  <p className="text-sm text-[#94A3B8] mt-1">点击上方按钮创建</p>
                </div>
              )}
            </div>

            {categories.length > 1 && (
              <div className="mt-4 pt-4 border-t border-[#E2E8F0] text-center">
                <p className="text-xs text-[#94A3B8]">
                  <GripVertical className="w-3 h-3 inline-block mr-1" />
                  拖动卡片可调整分类在前台的显示顺序
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-[#005BA3]" />
              编辑用户
            </DialogTitle>
            <DialogDescription>修改用户信息</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* 头像上传 */}
            <div className="flex items-center justify-center mb-2">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-[#005BA3] flex items-center justify-center overflow-hidden">
                  {editForm.avatar ? (
                    <img 
                      src={editForm.avatar} 
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
                    disabled={avatarUploading}
                  />
                  {avatarUploading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </label>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium text-[#64748B]">昵称</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium text-[#64748B]">角色</label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm({ ...editForm, role: value as typeof editForm.role })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">普通用户</SelectItem>
                  <SelectItem value="volunteer">志愿者</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium text-[#64748B]">已认证</label>
              <div className="flex items-center gap-2 col-span-3">
                <input
                  type="checkbox"
                  checked={editForm.is_verified}
                  onChange={(e) => setEditForm({ ...editForm, is_verified: e.target.checked })}
                  className="w-4 h-4 rounded border-[#E2E8F0]"
                />
                <span className="text-sm text-[#64748B]">标记为已认证用户</span>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium text-[#64748B]">状态</label>
              <div className="flex items-center gap-2 col-span-3">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-[#E2E8F0]"
                />
                <span className="text-sm text-[#64748B]">账号启用</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdateUser} className="bg-[#005BA3] hover:bg-[#004A8C]">
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Detail Dialog */}
      <FileDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        file={selectedFile as unknown as FileType}
        onDownload={handleDownloadFile}
      />

      {/* File Upload Dialog */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        categories={categories}
        onSuccess={() => fetchFiles()}
        userRole={profile?.role}
      />

      {/* Gift Points Dialog */}
      <Dialog open={pointsDialogOpen} onOpenChange={setPointsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-[#D97706]" />
              赠送积分
            </DialogTitle>
            <DialogDescription>
              为 <span className="font-semibold text-[#1E293B]">{giftingUser?.name}</span> 赠送积分
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium text-[#64748B]">积分数量</label>
              <Input
                type="number"
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value)}
                className="col-span-3"
                placeholder="输入积分数"
                min="1"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium text-[#64748B]">赠送原因</label>
              <Input
                value={giftReason}
                onChange={(e) => setGiftReason(e.target.value)}
                className="col-span-3"
                placeholder="可选，记录赠送原因"
              />
            </div>
            <div className="col-span-4 bg-[#F0F7FF] rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-[#005BA3]">
                <GraduationCap className="w-4 h-4" />
                <span>
                  当前积分：<span className="font-semibold">{giftingUser?.points}</span>
                  {giftAmount && !isNaN(parseInt(giftAmount)) && (
                    <span className="ml-2">
                      → 赠送后：<span className="font-semibold">{(giftingUser?.points || 0) + parseInt(giftAmount)}</span>
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPointsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleGiftPoints} className="bg-[#D97706] hover:bg-[#B45309]">
              确认赠送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 文件预览对话框 */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-[95vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewingFile?.title}</DialogTitle>
            <DialogDescription>
              {previewingFile?.file_name} · {formatFileSize(previewingFile?.file_size || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {previewingFile && (
              <FilePreviewDialog file={previewingFile} />
            )}
          </div>
          {/* 预览弹窗中的审核按钮 */}
          {previewingFile && !previewingFile.is_active && (
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
              <span className="text-sm text-[#64748B] mr-auto">此文件待审核</span>
              <Button
                variant="outline"
                onClick={() => {
                  handleRejectFile(previewingFile);
                  setPreviewDialogOpen(false);
                }}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4 mr-1" />
                拒绝
              </Button>
              <Button
                onClick={() => {
                  handleApproveFile(previewingFile);
                  setPreviewDialogOpen(false);
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                审核通过
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 修改分类对话框 */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>修改分类</DialogTitle>
            <DialogDescription>
              为「{editingCategoryFile?.title}」选择新的分类
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdateCategory} className="bg-[#005BA3] hover:bg-[#004A8C]">
              确认修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑标签对话框 */}
      <Dialog open={tagsDialogOpen} onOpenChange={setTagsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#005BA3]" />
              编辑标签
            </DialogTitle>
            <DialogDescription>
              为「{editingTagsFile?.title}」添加或修改标签
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* 已有标签 */}
            <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-[#F8FAFC] rounded-lg">
              {editingTags.length === 0 ? (
                <span className="text-sm text-[#94A3B8]">暂无标签</span>
              ) : (
                editingTags.map((tag, index) => (
                  <Badge
                    key={index}
                    className="bg-[#005BA3] text-white pr-1 flex items-center gap-1"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 p-0.5 rounded hover:bg-white/20"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            {/* 添加新标签 */}
            <div className="flex gap-2">
              <Input
                placeholder="输入新标签..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1"
              />
              <Button onClick={handleAddTag} variant="outline">
                添加
              </Button>
            </div>
            <p className="text-xs text-[#94A3B8]">
              提示：最多10个标签，每个标签不超过50个字符
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveTags} className="bg-[#005BA3] hover:bg-[#004A8C]">
              保存标签
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑分类信息对话框 */}
      <Dialog open={editCategoryDialogOpen} onOpenChange={setEditCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-[#005BA3]" />
              编辑分类
            </DialogTitle>
            <DialogDescription>
              修改分类的名称和标识
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#64748B]">分类名称</label>
              <Input
                value={editCategoryForm.name}
                onChange={(e) => setEditCategoryForm({ ...editCategoryForm, name: e.target.value })}
                placeholder="输入分类名称"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#64748B]">标识 (Slug)</label>
              <Input
                value={editCategoryForm.slug}
                onChange={(e) => setEditCategoryForm({ ...editCategoryForm, slug: e.target.value })}
                placeholder="输入标识，如：lecture-notes"
              />
              <p className="text-xs text-[#94A3B8]">用于URL路径，留空将自动生成</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCategoryDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSaveEditCategory}
              disabled={editCategoryLoading}
              className="bg-[#005BA3] hover:bg-[#004A8C]"
            >
              {editCategoryLoading ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 审核对话框 */}
      <Dialog open={aiReviewDialogOpen} onOpenChange={setAiReviewDialogOpen}>
        <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              AI 审核
            </DialogTitle>
            <DialogDescription>
              AI 审核内容合规性、分类准确性和标题质量（标题需自然包含来源标识、年份（若有）和内容标题，顺序由 AI 自然优化），需人工确认后执行修改
            </DialogDescription>
          </DialogHeader>

          {/* 加载中 */}
          {aiReviewLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full mb-4" />
              <p className="text-[#64748B]">正在加载待审核文件...</p>
            </div>
          )}

          {/* 步骤1：选择文件 */}
          {!aiReviewLoading && aiReviewStep === "select" && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="text-sm text-[#64748B]">
                  共 <span className="font-semibold text-[#1E293B]">{aiReviewFiles.length}</span> 个待审核文件
                  <span className="ml-2 text-xs">（已选 {aiReviewFiles.filter(f => f.selected).length}）</span>
                </div>
                <Button variant="outline" size="sm" onClick={selectAllFiles}>
                  {aiReviewFiles.filter(f => !f.reviewError).length > 0 && aiReviewFiles.filter(f => !f.reviewError).every(f => f.selected) ? "取消全选" : "全选"}
                </Button>
              </div>

              <div className="flex-1 border rounded-lg overflow-y-auto min-h-0">
                <table className="w-full table-fixed">
                  <thead className="bg-[#F8FAFC] sticky top-0">
                    <tr>
                        <th className="w-12 px-3 py-2 text-left">
                          <input
                            type="checkbox"
                            checked={aiReviewFiles.filter(f => !f.reviewError).length > 0 && aiReviewFiles.filter(f => !f.reviewError).every(f => f.selected)}
                            onChange={selectAllFiles}
                            className="w-4 h-4 rounded"
                          />
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-[#64748B] w-[30%]">文件名</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-[#64748B] w-[35%]">标题</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-[#64748B]">当前分类</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiReviewFiles.map((file) => (
                      <tr
                        key={file.id}
                        className="border-t hover:bg-[#F8FAFC] cursor-pointer"
                        onClick={() => toggleFileSelection(file.id)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={file.selected}
                            onChange={() => toggleFileSelection(file.id)}
                            className="w-4 h-4 rounded"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm text-[#1E293B] truncate" title={file.fileName}>
                          {file.fileName}
                        </td>
                        <td className="px-3 py-2 text-sm text-[#475569] truncate" title={file.title}>
                          {file.title}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="bg-[#F0F7FF] text-[#005BA3]">
                            {file.currentCategory}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 步骤1 底部按钮 */}
          {!aiReviewLoading && aiReviewStep === "select" && (
            <DialogFooter className="mt-4 flex-shrink-0">
              <Button variant="outline" onClick={() => setAiReviewDialogOpen(false)}>
                取消
              </Button>
              <Button
                onClick={runAiReview}
                disabled={aiReviewFiles.filter(f => f.selected).length === 0 || aiReviewAnalyzing}
                className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                开始 AI 审核
              </Button>
            </DialogFooter>
          )}

          {/* 步骤2：审核结果 */}
          {!aiReviewLoading && aiReviewStep === "review" && aiReviewStats && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {/* 统计信息 */}
              <div className="flex flex-wrap gap-3 mb-3 flex-shrink-0">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-700">
                    合规：<span className="font-semibold">{aiReviewStats.compliant}</span>
                  </span>
                </div>
                {aiReviewStats.nonCompliant > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-700">
                      不合规：<span className="font-semibold">{aiReviewStats.nonCompliant}</span>
                    </span>
                  </div>
                )}
                {aiReviewStats.categoryNeedFix > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-amber-700">
                      分类需修正：<span className="font-semibold">{aiReviewStats.categoryNeedFix}</span>
                    </span>
                  </div>
                )}
                {aiReviewStats.titleNeedOptimize > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
                    <Edit2 className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-blue-700">
                      标题可优化：<span className="font-semibold">{aiReviewStats.titleNeedOptimize}</span>
                    </span>
                  </div>
                )}
                {(aiReviewStats.failed || 0) > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-700">
                      审核失败：<span className="font-semibold">{aiReviewStats.failed}</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="text-sm text-[#64748B]">
                  已选中 <span className="font-semibold text-[#1E293B]">{aiReviewFiles.filter(f => f.selected).length}</span> 个
                </div>
                <Button variant="outline" size="sm" onClick={selectAllFiles}>
                  {aiReviewFiles.filter(f => !f.reviewError).length > 0 && aiReviewFiles.filter(f => !f.reviewError).every(f => f.selected) ? "取消全选" : "全选"}
                </Button>
              </div>

              <div className="flex-1 border rounded-lg overflow-y-auto min-h-0">
                <table className="w-full table-fixed">
                  <thead className="bg-[#F8FAFC] sticky top-0">
                    <tr>
                      <th className="w-12 px-2 py-2"></th>
                      <th className="w-28 px-2 py-2 text-left text-xs font-medium text-[#64748B]">状态</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-[#64748B] w-[25%]">原标题</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-[#64748B] w-[30%]">优化后标题（可编辑）</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-[#64748B] w-[18%]">分类</th>
                      <th className="w-16 px-2 py-2 text-center text-xs font-medium text-[#64748B]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiReviewFiles.map((file) => (
                      <tr
                        key={file.id}
                        className={`border-t hover:bg-[#F8FAFC] cursor-pointer ${!file.compliant ? 'bg-red-50' : ''}`}
                        onClick={() => toggleFileSelection(file.id)}
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={file.selected}
                            onChange={() => toggleFileSelection(file.id)}
                            className="w-4 h-4 rounded"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col gap-1">
                            {file.reviewError ? (
                              <Badge variant="destructive" className="text-xs">审核失败</Badge>
                            ) : !file.compliant ? (
                              <Badge variant="destructive" className="text-xs">不合规</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-700 text-xs">合规</Badge>
                            )}
                            {!file.reviewError && !file.categoryCorrect && (
                              <Badge className="bg-amber-100 text-amber-700 text-xs">分类错误</Badge>
                            )}
                            {!file.reviewError && file.titleChanged && (
                              <Badge className="bg-blue-100 text-blue-700 text-xs">标题优化</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {file.reviewError ? (
                            <span className="text-xs text-red-500 truncate block" title={file.fileName}>
                              {file.fileName}
                            </span>
                          ) : (
                            <span className="text-xs text-[#475569] line-through truncate block" title={file.title}>
                              {file.title}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {file.reviewError ? (
                            <span className="text-xs text-red-500">审核失败，暂无结果</span>
                          ) : (
                            <input
                              type="text"
                              value={file.optimizedTitle || ""}
                              onChange={(e) => {
                                e.stopPropagation();
                                updateAiReviewTitle(file.id, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              className={`w-full min-w-0 rounded-md border px-2 py-1 text-xs outline-none transition-colors ${
                                file.titleChanged
                                  ? "border-[#BFDBFE] bg-white text-[#005BA3] font-medium"
                                  : "border-dashed border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]"
                              }`}
                              placeholder="请输入标题"
                              title={file.optimizedTitle || file.title}
                            />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="secondary" className={`text-xs ${!file.categoryCorrect ? 'line-through opacity-50' : ''}`}>
                              {file.currentCategory}
                            </Badge>
                            {file.reviewError ? (
                              <span className="text-xs text-red-500">暂无分类结果</span>
                            ) : !file.categoryCorrect && file.suggestedCategory && (
                              <>
                                <span className="text-xs text-[#94A3B8]">→</span>
                                <select
                                  value={file.suggestedCategoryId || ''}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const newCategoryId = e.target.value;
                                    const newCategoryName = categories.find(c => c.id === newCategoryId)?.name || '';
                                    setAiReviewFiles(prev => prev.map(f => 
                                      f.id === file.id 
                                        ? { ...f, suggestedCategoryId: newCategoryId, suggestedCategory: newCategoryName }
                                        : f
                                    ));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs bg-purple-100 text-purple-700 border-0 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-purple-500"
                                >
                                  {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                  ))}
                                </select>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {!file.compliant && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNonCompliantFile(file.id, file.fileName);
                              }}
                              className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-100"
                              title="删除此不合规文件"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* 不合规文件说明 */}
              {aiReviewFiles.some(f => !f.compliant) && (
                <div className="mt-2 p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-red-700 font-medium">不合规文件说明：</p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={deleteAllNonCompliantFiles}
                      className="h-7 text-xs"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      删除所有不合规文件
                    </Button>
                  </div>
                  <ul className="text-xs text-red-600 space-y-1">
                    {aiReviewFiles.filter(f => !f.compliant).map(f => (
                      <li key={f.id} className="flex items-center justify-between py-1">
                        <span>• {f.fileName}: {f.complianceIssue}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNonCompliantFile(f.id, f.fileName);
                          }}
                          className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          删除
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-red-600 mt-2">⚠️ 不合规文件需人工处理，AI不会自动修改</p>
                </div>
              )}
            </div>
          )}

          {/* 步骤2 底部按钮 */}
          {!aiReviewLoading && aiReviewStep === "review" && (
            <DialogFooter className="mt-4 flex-shrink-0">
              <Button variant="outline" onClick={() => setAiReviewDialogOpen(false)}>
                取消
              </Button>
              <Button variant="outline" onClick={openAiReviewDialog}>
                重新选择
              </Button>
              <Button
                onClick={confirmAiReview}
                disabled={aiReviewAnalyzing}
                className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
              >
                确认执行修改
              </Button>
            </DialogFooter>
          )}

          {/* 步骤3：完成 */}
          {!aiReviewLoading && aiReviewStep === "confirm" && (
            <div className="py-8 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-[#1E293B] mb-2">AI 审核完成</h3>
              <p className="text-[#64748B] text-center mb-4">
                已处理 {aiReviewFiles.length} 个文件的审核
              </p>
              <p className="text-xs text-[#94A3B8]">
                已通过的文件会自动上架，未通过的文件保留待处理状态；下次审核时不会重复出现
              </p>
              <Button
                onClick={() => setAiReviewDialogOpen(false)}
                className="mt-6 bg-[#005BA3] hover:bg-[#004A8C]"
              >
                完成
              </Button>
            </div>
          )}

          {/* 分析中状态 */}
          {aiReviewAnalyzing && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center rounded-lg">
              <div className="animate-spin w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full mb-4" />
              <p className="text-[#64748B]">AI 正在审核中...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
