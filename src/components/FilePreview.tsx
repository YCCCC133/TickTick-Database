"use client";

import { useState, useEffect, useRef, memo, useCallback } from "react";
import { FileText } from "lucide-react";

interface FilePreviewProps {
  fileId: string;
  previewUrl?: string | null;
  fileType: string;
  mimeType?: string;
  title: string;
  fileKey?: string;
  onRatioChange?: (ratio: number) => void; // 宽高比回调
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

interface PdfRenderTask {
  promise: Promise<void>;
}

interface PdfPage {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    transform?: number[] | null;
  }): PdfRenderTask;
}

interface PdfDocument {
  getPage(pageNumber: number): Promise<PdfPage>;
}

interface PdfJsGlobal {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: {
    url: string;
    withCredentials?: boolean;
    disableAutoFetch?: boolean;
    disableStream?: boolean;
    rangeChunkSize?: number;
  }): { promise: Promise<PdfDocument> };
}

const FilePreview = memo(function FilePreview({
  fileId,
  previewUrl,
  fileType,
  mimeType,
  title,
  fileKey,
  onRatioChange,
}: FilePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [savedPreviewUrl, setSavedPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rendered, setRendered] = useState(false);

  const fileColor = FILE_TYPE_COLORS[fileType.toLowerCase()] || "#005BA3";

  // 检查是否是图片文件
  const isImage = mimeType?.startsWith("image/") || 
    ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(fileType.toLowerCase());

  // 检查是否是PDF文件
  const isPDF = mimeType === "application/pdf" || fileType.toLowerCase() === "pdf";

  // 优先使用已保存的预览图
  const displayPreviewUrl = savedPreviewUrl || previewUrl;

  // 获取PDF文件URL和检查预览图
  useEffect(() => {
    if (!isPDF) return;

    const fetchPdfInfo = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/files/${fileId}/thumbnail`);
        const data = await response.json();
        
        // 如果已有预览图，直接使用
        if (data.hasPreview && data.previewUrl) {
          setSavedPreviewUrl(data.previewUrl);
          setLoading(false);
          return;
        }
        
        // 否则获取PDF URL进行渲染
        // 优先使用代理 URL（支持分段加载），失败再退回 COS 直链
        if (data.proxyUrl && data.isPreviewable) {
          setPdfUrl(data.proxyUrl);
        } else if (data.directUrl && data.isPreviewable) {
          setPdfUrl(data.directUrl);
        } else if (data.url && data.isPreviewable) {
          setPdfUrl(data.url);
        }
      } catch (error) {
        console.error("Failed to fetch PDF info:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPdfInfo();
  }, [fileId, isPDF]);

  // 渲染PDF首页
  const renderPdfFirstPage = useCallback(async (url: string) => {
    if (!containerRef.current || !canvasContainerRef.current || rendered) return;

    try {
      // 动态加载PDF.js
      if (!window.pdfjsLib) {
        await loadPdfJs();
      }
      
      const pdfjs = window.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const loadingTask = pdfjs.getDocument({
        url,
        withCredentials: false,
        disableAutoFetch: true,
        disableStream: false,
        rangeChunkSize: 65536,
      });
      
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      // 获取页面实际尺寸
      const viewport = page.getViewport({ scale: 1 });
      const pdfRatio = viewport.width / viewport.height;
      
      // 回调通知父组件宽高比
      if (onRatioChange) {
        onRatioChange(pdfRatio);
      }

      // 计算容器可用尺寸
      const container = containerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // 计算缩放比例，确保整个页面都能显示
      let scale: number;
      if (containerWidth / containerHeight > pdfRatio) {
        // 容器更宽，按高度缩放
        scale = containerHeight / viewport.height;
      } else {
        // 容器更高，按宽度缩放
        scale = containerWidth / viewport.width;
      }

      const scaledViewport = page.getViewport({ scale });

      // 创建canvas
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;

      // 设置高清渲染
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(scaledViewport.width * outputScale);
      canvas.height = Math.floor(scaledViewport.height * outputScale);
      canvas.style.width = Math.floor(scaledViewport.width) + 'px';
      canvas.style.height = Math.floor(scaledViewport.height) + 'px';

      const transform = outputScale !== 1 
        ? [outputScale, 0, 0, outputScale, 0, 0] 
        : null;

      const renderTask = page.render({
        canvasContext: context,
        viewport: scaledViewport,
        transform,
      });

      await renderTask.promise;

      // 清空容器并添加canvas
      canvasContainerRef.current.innerHTML = "";
      canvasContainerRef.current.appendChild(canvas);
      setRendered(true);

      // 保存预览图到服务器
      await savePreviewImage(canvas);
      
    } catch (error) {
      console.error("Failed to render PDF:", error);
    }
  }, [rendered, onRatioChange]);

  // 保存预览图到服务器
  const savePreviewImage = async (canvas: HTMLCanvasElement) => {
    try {
      // 将canvas转为blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Failed to create blob"));
        }, "image/png", 0.9);
      });

      // 上传到服务器
      const formData = new FormData();
      formData.append("image", blob, "preview.png");

      const token = localStorage.getItem("token");
      const response = await fetch(`/api/files/${fileId}/preview`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.previewUrl) {
        setSavedPreviewUrl(data.previewUrl);
      }
    } catch (error) {
      console.error("Failed to save preview image:", error);
    }
  };

  // 加载PDF.js脚本
  const loadPdfJs = () => {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => resolve(true);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // 当PDF URL变化时渲染
  useEffect(() => {
    if (pdfUrl && !rendered && !displayPreviewUrl) {
      // 等待容器尺寸确定后再渲染
      const timer = setTimeout(() => {
        renderPdfFirstPage(pdfUrl);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pdfUrl, rendered, renderPdfFirstPage, displayPreviewUrl]);

  // 默认占位符
  const DefaultPlaceholder = (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] to-[#F1F5F9]">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center shadow-md"
        style={{ backgroundColor: fileColor }}
      >
        <FileText className="w-7 h-7 text-white" />
      </div>
    </div>
  );

  // 1. 图片文件 - 显示真实图片
  if (isImage) {
    if (previewUrl) {
      return (
        <div className="w-full h-full bg-white flex items-center justify-center p-1">
          <img
            src={previewUrl}
            alt={title}
            className="max-w-full max-h-full object-contain"
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              if (onRatioChange) {
                onRatioChange(img.naturalWidth / img.naturalHeight);
              }
            }}
          />
        </div>
      );
    }
    return DefaultPlaceholder;
  }

  // 2. PDF文件 - 优先使用预览图，否则渲染PDF
  if (isPDF) {
    // 如果有预览图，直接显示
    if (displayPreviewUrl) {
      return (
        <div className="w-full h-full bg-white flex items-center justify-center p-1">
          <img
            src={displayPreviewUrl}
            alt={title}
            className="max-w-full max-h-full object-contain"
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              if (onRatioChange) {
                onRatioChange(img.naturalWidth / img.naturalHeight);
              }
            }}
          />
        </div>
      );
    }

    // 否则渲染PDF
    return (
      <div 
        ref={containerRef}
        className="w-full h-full bg-white flex items-center justify-center p-1"
      >
        <div ref={canvasContainerRef} className="flex items-center justify-center">
          {loading && !rendered && (
            <div className="animate-pulse flex flex-col items-center gap-2">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: fileColor }}
              >
                <FileText className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs text-[#94A3B8]">加载中...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. 其他文件类型 - 显示文件图标
  return DefaultPlaceholder;
});

// 添加类型声明
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

export default FilePreview;
