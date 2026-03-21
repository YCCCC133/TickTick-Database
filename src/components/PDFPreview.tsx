"use client";

import { useEffect, useRef, useState, memo } from "react";
import * as pdfjsLib from "pdfjs-dist";

// 设置PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface PDFPreviewProps {
  url: string;
  className?: string;
  fallback?: React.ReactNode;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

const PDFPreview = memo(function PDFPreview({
  url,
  className,
  fallback,
  onLoad,
  onError,
}: PDFPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !url) return;

    let isCancelled = false;

    const renderPDF = async () => {
      try {
        setLoading(true);
        setError(false);

        // 加载PDF文档
        const loadingTask = pdfjsLib.getDocument({
          url,
          withCredentials: false,
          disableAutoFetch: true,
          disableStream: false,
          rangeChunkSize: 65536,
        });

        const pdf = await loadingTask.promise;

        if (isCancelled) return;

        // 获取第一页
        const page = await pdf.getPage(1);

        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        // 计算缩放比例以适应容器
        const viewport = page.getViewport({ scale: 1 });
        const containerWidth = canvas.parentElement?.clientWidth || 300;
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

        if (!isCancelled) {
          setLoading(false);
          onLoad?.();
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("PDF preview error:", err);
          setError(true);
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error("PDF加载失败"));
        }
      }
    };

    renderPDF();

    return () => {
      isCancelled = true;
    };
  }, [url, onLoad, onError]);

  if (error && fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className={className}>
      {loading && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#F0F7FF] to-[#E0F0FF] animate-pulse" />
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-contain ${loading ? "opacity-0" : "opacity-100"} transition-opacity duration-300`}
      />
    </div>
  );
});

export default PDFPreview;
