"use client";

import { useState, memo } from "react";
import { Download, Star, Award, FileText, MessageCircle, Edit2 } from "lucide-react";
import { File } from "@/types";
import { formatFileSize } from "@/lib/utils";
import PDFThumbnail from "./PDFThumbnail";

// 全局图片预览缓存
const imagePreviewCache = new Map<string, string>();

interface FileCardProps {
  file: File;
  isVolunteer: boolean;
  onDownload: (fileId: string, fileName: string) => void;
  onDelete: (fileId: string) => void;
  onEditCategory?: (fileId: string) => void;
  onClick: () => void;
  onPreviewGenerated?: (fileId: string, previewUrl: string) => void;
}

// 文件类型颜色映射
const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: "#EF4444",
  doc: "#3B82F6",
  docx: "#3B82F6",
  ppt: "#F97316",
  pptx: "#F97316",
  xls: "#22C55E",
  xlsx: "#22C55E",
  zip: "#8B5CF6",
  rar: "#8B5CF6",
};

const FileCard = memo(function FileCard({
  file,
  isVolunteer,
  onDownload,
  onDelete,
  onEditCategory,
  onClick,
  onPreviewGenerated,
}: FileCardProps) {
  const fileColor = FILE_TYPE_COLORS[file.file_type.toLowerCase()] || "#005BA3";
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | undefined>(() => file.preview_url || imagePreviewCache.get(file.id) || undefined);
  const [imageError, setImageError] = useState(false);
  const [previewFallback, setPreviewFallback] = useState(false);

  // 判断文件类型
  const isPDF = file.mime_type === "application/pdf" || file.file_type.toLowerCase() === "pdf";
  const isImage = file.mime_type?.startsWith("image/");
  const resolvedPreviewUrl = file.preview_url || imagePreviewCache.get(file.id) || currentPreviewUrl || undefined;

  // 获取预览图URL（图片类型）
  const getImagePreviewSrc = () => {
    if (resolvedPreviewUrl && !previewFallback) {
      return resolvedPreviewUrl;
    }
    // 如果是图片，使用代理接口
    if (isImage) {
      return `/api/files/${file.id}/proxy`;
    }
    return null;
  };

  // 获取PDF代理URL
  const getPDFProxyUrl = () => {
    return `/api/files/${file.id}/proxy`;
  };

  const imagePreviewSrc = getImagePreviewSrc();

  // 处理PDF预览生成完成
  const handlePDFPreviewGenerated = (url: string) => {
    setCurrentPreviewUrl(url);
    imagePreviewCache.set(file.id, url);
    onPreviewGenerated?.(file.id, url);
  };

  // 处理图片加载成功
  const handleImageLoad = () => {
    if (imagePreviewSrc && !resolvedPreviewUrl) {
      imagePreviewCache.set(file.id, imagePreviewSrc);
    }
  };

  // 处理图片加载失败
  const handleImageError = () => {
    if (!previewFallback && resolvedPreviewUrl) {
      setPreviewFallback(true);
      setImageError(false);
      imagePreviewCache.delete(file.id);
      return;
    }
    setImageError(true);
  };

  return (
    <div
      className="group flex items-center gap-3 p-3 bg-white border border-[#E2E8F0] rounded-lg hover:border-[#005BA3] hover:shadow-sm transition-all cursor-pointer"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "96px",
      }}
      onClick={onClick}
    >
      {/* 左侧预览图 */}
      <div 
        className="w-16 h-20 flex-shrink-0 rounded-md overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center relative"
        style={{ backgroundColor: (imagePreviewSrc || (isPDF && currentPreviewUrl)) ? 'transparent' : `${fileColor}15` }}
      >
        {/* 图片预览 */}
        {isImage && imagePreviewSrc && !imageError && (
          <img 
            src={imagePreviewSrc} 
            alt={file.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}

        {/* 图片加载失败时显示图标 */}
        {isImage && imageError && (
          <FileText 
            className="w-6 h-6" 
            style={{ color: fileColor }}
          />
        )}

        {/* PDF预览 */}
        {isPDF && !isImage && (
          <PDFThumbnail
            fileId={file.id}
            fileUrl={getPDFProxyUrl()}
            previewUrl={currentPreviewUrl || null}
            alt={file.title}
            className="w-full h-full"
            fileColor={fileColor}
            onPreviewGenerated={handlePDFPreviewGenerated}
          />
        )}

        {/* 其他文件类型图标 */}
        {!isPDF && !isImage && (
          <FileText 
            className="w-6 h-6" 
            style={{ color: fileColor }}
          />
        )}
        
        {/* 文件类型标签 */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] py-0.5 text-center font-medium">
          {file.file_type.toUpperCase()}
        </div>
        
        {/* 精选标记 */}
        {file.is_featured && (
          <div className="absolute top-0.5 left-0.5 bg-amber-400 p-0.5 rounded-full">
            <Award className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      {/* 中间信息区 */}
      <div className="flex-1 min-w-0">
        {/* 标题 */}
        <h3 
          className="font-medium text-[#1E293B] text-sm group-hover:text-[#005BA3] transition-colors truncate"
          title={file.title}
        >
          {file.title}
        </h3>
        
        {/* 课程和学期 */}
        {(file.course || file.semester) && (
          <p className="text-xs text-[#64748B] mt-0.5 truncate">
            {file.course && <span>{file.course}</span>}
            {file.course && file.semester && <span> · </span>}
            {file.semester && <span>{file.semester}</span>}
          </p>
        )}
        
        {/* 统计信息 */}
        <div className="flex items-center gap-3 text-xs text-[#64748B] mt-1">
          <span className="flex items-center gap-0.5">
            <Download className="w-3 h-3" />
            {file.download_count}
          </span>
          <span className="flex items-center gap-0.5">
            <Star className="w-3 h-3 fill-[#FBBF24] text-[#FBBF24]" />
            {parseFloat(file.average_rating).toFixed(1)}
          </span>
          <span className="flex items-center gap-0.5">
            <MessageCircle className="w-3 h-3" />
            {file.comment_count || 0}
          </span>
          <span className="text-[#94A3B8]">{formatFileSize(file.file_size)}</span>
        </div>

        {/* 上传者和标签 */}
        <div className="flex items-center gap-2 mt-1">
          {file.profiles && (
            <span className="text-xs text-[#94A3B8] truncate max-w-[100px]">
              {file.profiles.name}
            </span>
          )}
          {file.tags && file.tags.length > 0 && (
            <div className="flex gap-1 overflow-hidden">
              {file.tags.slice(0, 1).map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#3B82F6] font-medium whitespace-nowrap"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file.id, file.file_name);
          }}
          className="px-3 py-1.5 text-xs font-medium text-[#005BA3] bg-[#F0F7FF] rounded-md hover:bg-[#005BA3] hover:text-white transition-colors flex items-center gap-1"
        >
          <Download className="w-3 h-3" />
          下载
        </button>
        {isVolunteer && onEditCategory && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditCategory(file.id);
            }}
            className="p-1.5 text-[#6366F1] bg-[#EEF2FF] rounded-md hover:bg-[#6366F1] hover:text-white transition-colors"
            title="修改分类"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
        {isVolunteer && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(file.id);
            }}
            className="p-1.5 text-[#EF4444] bg-[#FEF2F2] rounded-md hover:bg-[#EF4444] hover:text-white transition-colors"
            title="删除"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

export default FileCard;
