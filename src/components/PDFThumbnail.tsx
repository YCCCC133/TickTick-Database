"use client";

import { useEffect, useRef, useState, memo } from "react";
import { FileText } from "lucide-react";

// 声明全局 pdfjsLib 类型
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

// 全局缓存：记录已加载的文件ID和生成的预览URL
const loadedFilesCache = new Map<string, string>();
// 全局记录正在加载中的文件，防止重复加载
const loadingFilesSet = new Set<string>();
// 全局记录加载失败的文件，避免无限重试
const failedFilesSet = new Set<string>();
// PDF.js 是否已加载
let pdfJsLoaded = false;
let pdfJsLoading = false;

// 并发控制：限制同时加载的PDF数量
const MAX_CONCURRENT_LOADS = 2;
let currentLoads = 0;
const loadQueue: (() => void)[] = [];

// 获取加载槽位
async function acquireLoadSlot(): Promise<void> {
  if (currentLoads < MAX_CONCURRENT_LOADS) {
    currentLoads++;
    return;
  }
  return new Promise((resolve) => {
    loadQueue.push(() => {
      currentLoads++;
      resolve();
    });
  });
}

// 释放加载槽位
function releaseLoadSlot(): void {
  currentLoads--;
  const next = loadQueue.shift();
  if (next) {
    next();
  }
}

interface PDFThumbnailProps {
  fileId: string;
  fileUrl: string;
  previewUrl?: string | null;
  alt: string;
  className?: string;
  fileColor: string;
  onPreviewGenerated?: (url: string) => void;
}

const PDFThumbnail = memo(function PDFThumbnail({
  fileId,
  fileUrl,
  previewUrl,
  alt,
  className,
  fileColor,
  onPreviewGenerated,
}: PDFThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [fallbackTriggered, setFallbackTriggered] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(() => {
    // 初始化时检查是否有缓存或外部传入的预览URL
    return previewUrl || loadedFilesCache.get(fileId) || null;
  });
  const hasInitRef = useRef(false);

  // 加载 PDF.js 脚本
  const loadPdfJsScript = () => {
    return new Promise<void>((resolve, reject) => {
      if (pdfJsLoaded && window.pdfjsLib) {
        resolve();
        return;
      }

      if (pdfJsLoading) {
        // 等待加载完成
        const checkLoaded = setInterval(() => {
          if (pdfJsLoaded && window.pdfjsLib) {
            clearInterval(checkLoaded);
            resolve();
          }
        }, 100);
        return;
      }

      pdfJsLoading = true;
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        pdfJsLoaded = true;
        pdfJsLoading = false;
        resolve();
      };
      script.onerror = () => {
        pdfJsLoading = false;
        reject(new Error("PDF.js 加载失败"));
      };
      document.head.appendChild(script);
    });
  };

  // 当外部传入的previewUrl变化时更新
  useEffect(() => {
    if (previewUrl && previewUrl !== displayUrl) {
      setDisplayUrl(previewUrl);
      loadedFilesCache.set(fileId, previewUrl);
      // 从失败集合中移除
      failedFilesSet.delete(fileId);
      setFallbackTriggered(false);
    }
  }, [previewUrl, fileId, displayUrl]);

  const handlePreviewError = () => {
    if (fallbackTriggered) return;
    setFallbackTriggered(true);
    loadedFilesCache.delete(fileId);
    setDisplayUrl(null);
    setError(false);
  };

  // 使用 Intersection Observer 懒加载
  useEffect(() => {
    // 如果已有显示URL，直接显示
    if (displayUrl) return;
    
    // 如果正在加载中或已失败，跳过
    if (loadingFilesSet.has(fileId) || failedFilesSet.has(fileId)) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasInitRef.current && !loadingFilesSet.has(fileId) && !failedFilesSet.has(fileId)) {
            hasInitRef.current = true;
            loadingFilesSet.add(fileId);
            loadAndRenderPDF();
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "100px", // 提前100px开始加载（减少预加载距离）
        threshold: 0.1,
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [fileId, displayUrl]);

  // 加载并渲染PDF预览
  const loadAndRenderPDF = async () => {
    if (!canvasRef.current) {
      loadingFilesSet.delete(fileId);
      return;
    }

    let slotAcquired = false;
    try {
      setLoading(true);
      setError(false);

      // 获取并发槽位
      await acquireLoadSlot();
      slotAcquired = true;

      // 确保 PDF.js 已加载
      await loadPdfJsScript();

      if (!window.pdfjsLib) {
        throw new Error("PDF.js 加载失败");
      }

      const pdfjs = window.pdfjsLib;

      // 加载PDF文档
      const loadingTask = pdfjs.getDocument({
        url: fileUrl,
        withCredentials: false,
        disableAutoFetch: true,
        disableStream: false,
        rangeChunkSize: 65536, // 64KB chunks for faster initial loading
      });

      const pdf = await loadingTask.promise;

      // 获取第一页
      const page = await pdf.getPage(1);

      const canvas = canvasRef.current;
      if (!canvas) {
        loadingFilesSet.delete(fileId);
        releaseLoadSlot();
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) {
        loadingFilesSet.delete(fileId);
        releaseLoadSlot();
        return;
      }

      // 计算缩放比例 - 使用较小的缩放以生成缩略图
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = 128; // 缩略图宽度
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      // 设置canvas尺寸
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;

      // 渲染PDF页面
      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
        canvas,
      } as any).promise;

      setLoading(false);

      // 将canvas转换为blob并上传
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Canvas to blob failed"));
            },
            "image/png",
            0.7 // 压缩质量
          );
        });

        // 上传预览图到服务器
        const formData = new FormData();
        formData.append("image", blob, `preview_${fileId}.png`);

        const response = await fetch(`/api/files/${fileId}/preview`, {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.previewUrl) {
            setDisplayUrl(data.previewUrl);
            loadedFilesCache.set(fileId, data.previewUrl);
            onPreviewGenerated?.(data.previewUrl);
          }
        }
      } catch (uploadError) {
        // 上传失败不影响预览显示，canvas已经渲染好了
        console.warn("上传预览图失败:", uploadError);
      }
    } catch (err) {
      console.error("PDF thumbnail error:", err);
      setError(true);
      setLoading(false);
      failedFilesSet.add(fileId);
    } finally {
      loadingFilesSet.delete(fileId);
      if (slotAcquired) {
        releaseLoadSlot();
      }
    }
  };

  // 如果有预览URL，直接显示图片
  if (displayUrl) {
    return (
      <div ref={containerRef} className={className}>
        <img
          src={displayUrl}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={handlePreviewError}
        />
      </div>
    );
  }

  // 加载中或错误状态
  return (
    <div
      ref={containerRef}
      className={`${className} flex items-center justify-center relative overflow-hidden`}
      style={{ backgroundColor: `${fileColor}15` }}
    >
      {loading && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 animate-pulse" />
      )}
      {error && (
        <FileText className="w-6 h-6 relative z-10" style={{ color: fileColor }} />
      )}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${loading || error ? "opacity-0" : "opacity-100"} transition-opacity duration-300`}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
});

export default PDFThumbnail;
