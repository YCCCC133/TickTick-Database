"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Download, Star, FileText, Calendar, User, MessageCircle, Send, X, Coins, Award, Trash2, Loader2 } from "lucide-react";
import { File, Rating, Comment } from "@/types";
import { formatFileSize } from "@/lib/utils";
import { toast } from "sonner";
import { POINTS_CONFIG } from "@/types/points";
import { useAuth } from "@/contexts/AuthContext";

const PDFViewer = dynamic(
  () => import("@/components/PDFViewer").then((mod) => mod.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[420px]">
        <Loader2 className="w-8 h-8 text-[#005BA3] animate-spin" />
      </div>
    ),
  }
);

interface FileDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onDownload: (fileId: string, fileName: string) => void;
}

export default function FileDetailDialog({
  open,
  onOpenChange,
  file,
  onDownload,
}: FileDetailDialogProps) {
  const { user, profile, isAdmin, isVolunteer } = useAuth();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userRating, setUserRating] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(false);
  
  // 文件预览状态
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  // Office文档预览状态
  const [officePreviewUrl, setOfficePreviewUrl] = useState<string | null>(null);
  const [officePreviewLoading, setOfficePreviewLoading] = useState(false);
  const [officePreviewError, setOfficePreviewError] = useState<string | null>(null);

  // 判断文件类型 - 使用useMemo确保在useEffect之前计算
  const fileType = useMemo(() => {
    if (!file) return { isPDF: false, isImage: false, isOfficeDoc: false, isTextFile: false, isCodeFile: false };
    return {
      isPDF: file.mime_type === "application/pdf" || file.file_type.toLowerCase() === "pdf",
      isImage: file.mime_type?.startsWith("image/"),
      isOfficeDoc: ["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(file.file_type.toLowerCase()),
      isTextFile: ["txt", "md", "json", "xml", "csv", "log", "yml", "yaml", "ini", "conf", "cfg"].includes(file.file_type.toLowerCase()) 
        || file.mime_type?.startsWith("text/"),
      isCodeFile: ["js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "css", "scss", "html", "sql", "sh", "bat"].includes(file.file_type.toLowerCase()),
    };
  }, [file]);

  useEffect(() => {
    if (open && file) {
      // 加载文件 URL
      loadFileUrl();

      const metaTimer = window.setTimeout(() => {
        void fetchRatings();
        void fetchComments();
      }, 300);

      return () => window.clearTimeout(metaTimer);
    }
  }, [open, file]);

  const fetchRatings = async () => {
    if (!file) return;
    try {
      const response = await fetch(`/api/ratings?fileId=${file.id}`);
      const data = await response.json();
      setRatings(data.ratings || []);
    } catch (error) {
      console.error("Failed to fetch ratings:", error);
    }
  };

  const fetchComments = async () => {
    if (!file) return;
    try {
      const response = await fetch(`/api/comments?fileId=${file.id}`);
      const data = await response.json();
      setComments(data.comments || []);
    } catch (error) {
      console.error("Failed to fetch comments:", error);
    }
  };

  // 加载文件 URL
  const loadFileUrl = async () => {
    if (!file) return;
    setPreviewLoading(true);
    setFileUrl(null);
    setTextContent(null);
    setOfficePreviewUrl(null);
    
    try {
      // 获取文件 URL
      const response = await fetch(`/api/files/${file.id}/thumbnail`);
      const data = await response.json();
      
      // 优先级：
      // 1. PDF 优先 proxyUrl（服务端流式转发，支持分段加载）
      // 2. 图片优先 previewUrl/directUrl
      // 3. 其他文件优先 directUrl
      const isImage = file.mime_type?.startsWith("image/");
      const isPDF = file.mime_type === "application/pdf" || file.file_type.toLowerCase() === "pdf";
      let urlToUse = null;

      if (isPDF) {
        urlToUse = data.proxyUrl || data.directUrl;
      } else if (isImage && data.previewUrl) {
        urlToUse = data.previewUrl;
      } else {
        urlToUse = data.directUrl || data.proxyUrl;
      }
      
      if (urlToUse) {
        setFileUrl(urlToUse);
      }
    } catch (error) {
      console.error("Failed to load file URL:", error);
    } finally {
      setPreviewLoading(false);
    }
  };

  // 加载Office文档预览URL
  useEffect(() => {
    if (fileType.isOfficeDoc && file) {
      setOfficePreviewLoading(true);
      setOfficePreviewError(null);
      const token = localStorage.getItem("token");
      
      fetch(`/api/files/${file.id}/office-preview-url`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.url) {
            // 优先使用微软 Office Online Viewer（更稳定）
            // 微软预览服务 URL 格式：https://view.officeapps.live.com/op/view.aspx?src=文件URL
            const msUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(data.url)}`;
            console.log("[Office Preview] Microsoft Office Online URL:", msUrl);
            setOfficePreviewUrl(msUrl);
          } else {
            console.error("[Office Preview] Failed to get preview URL:", data.error);
            setOfficePreviewError(data.error || "获取预览URL失败");
            setOfficePreviewUrl(null);
          }
        })
        .catch(err => {
          console.error("[Office Preview] Failed to load office preview URL:", err);
          setOfficePreviewError("加载预览URL失败");
          setOfficePreviewUrl(null);
        })
        .finally(() => {
          setOfficePreviewLoading(false);
        });
    }
  }, [fileType.isOfficeDoc, file]);

  // 加载文本内容
  useEffect(() => {
    if ((fileType.isTextFile || fileType.isCodeFile) && fileUrl) {
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
  }, [fileType.isTextFile, fileType.isCodeFile, fileUrl]);

  const handleRating = async (score: number) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("请先登录");
      return;
    }

    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileId: file?.id, score }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setUserRating(score);
      toast.success("评分成功");
      fetchRatings();
    } catch (error) {
      console.error("Rating error:", error);
      toast.error("评分失败");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("请先登录");
      return;
    }

    if (!confirm("确定要删除这条评论吗？")) {
      return;
    }

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("评论已删除");
      fetchComments();
    } catch (error) {
      console.error("Delete comment error:", error);
      toast.error("删除失败");
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;

    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("请先登录");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileId: file?.id, content: commentText }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setCommentText("");
      toast.success("评论成功");
      fetchComments();
    } catch (error) {
      console.error("Comment error:", error);
      toast.error("评论失败");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (!file) return null;

  // 获取文件类型图标颜色
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      pdf: "#EF4444",
      doc: "#3B82F6",
      docx: "#3B82F6",
      ppt: "#F97316",
      pptx: "#F97316",
      xls: "#22C55E",
      xlsx: "#22C55E",
      zip: "#8B5CF6",
      rar: "#8B5CF6",
      default: "#005BA3",
    };
    return colors[type.toLowerCase()] || colors.default;
  };

  const { isPDF, isImage, isOfficeDoc, isTextFile, isCodeFile } = fileType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[900px] bg-white border-[#E2E8F0] rounded-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{file?.title || '文件详情'}</DialogTitle>
        <DialogDescription className="sr-only">查看文件详情、评分和评论</DialogDescription>
        
        {/* 预览区域 */}
        <div className="relative bg-[#F8FAFC] overflow-hidden pt-2 pr-2 sm:pt-4 sm:pr-4">
          {previewLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="w-10 h-10 text-[#005BA3] animate-spin" />
            </div>
          ) : (
            <>
              {/* PDF预览 */}
              {isPDF && (
                <div className="p-4">
                  {fileUrl ? (
                    <PDFViewer url={fileUrl} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-[#64748B] bg-gray-50 rounded-lg">
                      <FileText className="w-12 h-12 mb-3 opacity-50" />
                      <p>PDF预览暂时不可用</p>
                      <p className="text-sm mt-1">请下载文件后查看</p>
                      <button
                        onClick={() => file && onDownload(file.id, file.file_name)}
                        className="mt-3 px-4 py-2 bg-[#005BA3] text-white rounded-lg hover:bg-[#004a8c] transition-colors flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        下载文件
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* 图片预览 */}
              {isImage && fileUrl && (
                <img 
                  src={file.preview_url || fileUrl} 
                  alt={file.title}
                  className="w-full max-h-[400px] object-contain"
                />
              )}
              
              {/* Office文档预览 */}
              {isOfficeDoc && (
                <div className="w-full">
                  <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-blue-700">
                        在线预览 {file.file_type.toUpperCase()} 文件
                      </span>
                    </div>
                    <button
                      onClick={() => file && onDownload(file.id, file.file_name)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      下载文件
                    </button>
                  </div>
                  {officePreviewLoading ? (
                    <div className="flex items-center justify-center h-[400px]">
                      <Loader2 className="w-8 h-8 text-[#005BA3] animate-spin" />
                    </div>
                  ) : officePreviewUrl ? (
                    <iframe
                      src={officePreviewUrl}
                      className="w-full h-[500px] border-0"
                      title="Office文档预览"
                      allow="fullscreen"
                      onError={() => {
                        console.error("[Office Preview] iframe load error");
                        setOfficePreviewError("Office预览服务加载失败，请下载文件查看");
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-[#64748B]">
                      <FileText className="w-12 h-12 mb-3 opacity-50" />
                      <p>{officePreviewError || "预览加载失败"}</p>
                      <p className="text-sm mt-1">请下载文件后查看</p>
                      <button
                        onClick={() => file && onDownload(file.id, file.file_name)}
                        className="mt-3 px-4 py-2 bg-[#005BA3] text-white rounded-lg hover:bg-[#004a8c] transition-colors flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        下载文件
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* 文本/代码文件预览 */}
              {(isTextFile || isCodeFile) && (
                <div className="w-full p-4">
                  {textLoading ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <Loader2 className="w-8 h-8 text-[#005BA3] animate-spin" />
                    </div>
                  ) : textContent ? (
                    <div className="bg-gray-800 rounded-lg p-4 overflow-auto max-h-[400px]">
                      <pre className="text-gray-100 text-sm whitespace-pre-wrap break-all font-mono">
                        {textContent}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-[#64748B]">
                      加载失败
                    </div>
                  )}
                </div>
              )}
              
              {/* 其他文件类型 - 显示图标 */}
              {!isPDF && !isImage && !isOfficeDoc && !isTextFile && !isCodeFile && (
                file.preview_url ? (
                  <img 
                    src={file.preview_url} 
                    alt={file.title}
                    className="w-full h-48 object-cover"
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center">
                    <div 
                      className="w-24 h-24 rounded-2xl flex items-center justify-center shadow-lg"
                      style={{ backgroundColor: getTypeColor(file.file_type) }}
                    >
                      <FileText className="w-12 h-12 text-white" />
                    </div>
                  </div>
                )
              )}
            </>
          )}
          
          {/* 渐变遮罩 */}
          {!isPDF && !isOfficeDoc && !isTextFile && !isCodeFile && file?.preview_url && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          )}
          
          {/* 关闭按钮 */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center transition-colors z-10"
          >
            <X className="w-4 h-4 text-[#64748B]" />
          </button>

          {/* 格式标签 */}
          <Badge 
            className="absolute top-4 left-4 bg-white text-[#475569] border-[#E2E8F0] z-10"
          >
            {file.file_type.toUpperCase()}
          </Badge>
        </div>

        <div className="p-6">
          {/* 标题区域 */}
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-[#1E293B] mb-1">{file.title}</h2>
            {file.course && (
              <p className="text-sm text-[#64748B]">{file.course}</p>
            )}
          </div>

          {/* 属性栏 */}
          <div className="flex items-center gap-6 text-sm text-[#64748B] mb-6 pb-4 border-b border-[#E2E8F0]">
            <span className="flex items-center gap-1.5">
              <Download className="w-4 h-4" />
              {file.download_count} 次下载
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4 fill-[#005BA3] text-[#005BA3]" />
              {parseFloat(file.average_rating).toFixed(1)} 分
            </span>
            <span>{formatFileSize(file.file_size)}</span>
            {file.semester && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {file.semester}
              </span>
            )}
          </div>

          {/* 文件介绍 */}
          {file.description && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-[#1E293B] mb-2">介绍</h3>
              <p className="text-sm text-[#475569] leading-relaxed">{file.description}</p>
            </div>
          )}

          {/* 标签 */}
          {file.tags && file.tags.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-[#1E293B] mb-2">标签</h3>
              <div className="flex flex-wrap gap-2">
                {file.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1 rounded-full bg-[#F1F5F9] text-[#475569]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 评分区域 */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-[#1E293B] mb-3">评分</h3>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRating(star)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (userRating || parseFloat(file.average_rating))
                        ? "fill-[#005BA3] text-[#005BA3]"
                        : "text-[#E2E8F0]"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-[#64748B]">
                ({ratings.length} 人评分)
              </span>
            </div>
          </div>

          {/* 评论区 */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              评论 ({comments.length})
            </h3>

            {/* 评论输入 */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="写下你的评论..."
                className="neu-input flex-1 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleComment()}
              />
              <button
                onClick={handleComment}
                disabled={loading || !commentText.trim()}
                className="neu-button-primary px-4 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* 评论列表 */}
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-sm text-[#94A3B8] text-center py-4">暂无评论</p>
              ) : (
                comments.map((comment) => {
                  // 判断是否有删除权限：评论本人、管理员、志愿者
                  const canDelete = user && (comment.user_id === user.id || isAdmin || isVolunteer);
                  // 获取昵称：优先profiles.name，否则显示"用户+ID后4位"
                  const displayName = comment.profiles?.name || `用户${comment.user_id.slice(-4)}`;
                  
                  return (
                    <div
                      key={comment.id}
                      className="p-3 bg-[#F8FAFC] rounded-lg group"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#005BA3] flex items-center justify-center">
                            <User className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-sm font-medium text-[#1E293B]">
                            {displayName}
                          </span>
                          <span className="text-xs text-[#94A3B8]">
                            {formatDate(comment.created_at)}
                          </span>
                        </div>
                        {/* 删除按钮 */}
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                            title="删除评论"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-[#475569] pl-8">{comment.content}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 下载按钮 */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm text-[#64748B]">
              <Coins className="w-4 h-4 text-[#F59E0B]" />
              <span>下载消耗 <span className="text-[#F59E0B] font-medium">{POINTS_CONFIG.DOWNLOAD_COST}</span> 积分</span>
              {file.is_featured && (
                <>
                  <span className="mx-2">·</span>
                  <Award className="w-4 h-4 text-[#F59E0B]" />
                  <span className="text-[#F59E0B]">精选资料</span>
                </>
              )}
            </div>
            <button
              onClick={() => {
                onDownload(file.id, file.file_name);
                onOpenChange(false);
              }}
              className="w-full neu-button text-[#005BA3] font-medium py-3 flex items-center justify-center gap-2 hover:bg-[#005BA3] hover:text-white transition-colors"
            >
              <Download className="w-5 h-5" />
              下载资料
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
