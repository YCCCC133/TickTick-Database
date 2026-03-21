"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FileText, Loader2, ZoomIn, ZoomOut, Grid3X3, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensurePdfJsLoaded } from "@/lib/pdfjs-loader";

interface PDFTileViewerProps {
  url: string;
  className?: string;
}

// 页面尺寸信息
interface PageSize {
  width: number;
  height: number;
  aspectRatio: number;
}

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
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void> | void;
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

export function PDFTileViewer({ url, className = "" }: PDFTileViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const pdfDocRef = useRef<PdfDocument | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLibReady, setPdfLibReady] = useState(false);
  const [scale, setScale] = useState(1.5); // 默认缩放150%
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid"); // grid 或 list
  const [pageSizes, setPageSizes] = useState<Map<number, PageSize>>(new Map());
  const pageSizesRef = useRef<Map<number, PageSize>>(new Map());
  const [containerWidth, setContainerWidth] = useState(600);
  const [defaultAspectRatio, setDefaultAspectRatio] = useState(0.75);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const renderRunningRef = useRef(false);

  // 监听容器宽度变化
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // 动态加载 PDF.js 脚本
  useEffect(() => {
    const initPdfLib = async () => {
      try {
        await ensurePdfJsLoaded();
        setPdfLibReady(true);
      } catch (err) {
        console.error("Failed to load PDF.js:", err);
        setError("PDF.js 加载失败");
        setLoading(false);
      }
    };

    if (typeof window !== "undefined") {
      initPdfLib();
    }
  }, []);

  // 加载 PDF 文档
  useEffect(() => {
    const loadPDF = async () => {
      if (!pdfLibReady || !url) return;

      setLoading(true);
      setError(null);
      setPdfDoc(null);
      setTotalPages(0);
      setRenderedPages(new Set());
      setPageSizes(new Map());
      pageSizesRef.current = new Map();
      renderedPagesRef.current = new Set();
      renderRunningRef.current = false;

      try {
        const pdfjs = window.pdfjsLib;
        const loadingTask = pdfjs.getDocument({
          url: url,
          withCredentials: false,
          disableAutoFetch: true,
          disableStream: false,
          rangeChunkSize: 65536,
        });
        const pdf = await loadingTask.promise;
        pdfDocRef.current = pdf;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("PDF 加载失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    };

    loadPDF();

    // 清理函数
    return () => {
      if (pdfDocRef.current) {
        void pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
  }, [url, pdfLibReady]);

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || renderedPagesRef.current.has(pageNum) || renderRunningRef.current) return;

    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null;
    if (!canvas) return;

    const pageContainer = pageRefs.current.get(pageNum);
    if (!pageContainer) return;

    renderRunningRef.current = true;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const context = canvas.getContext("2d");
      if (!context) return;

      const viewport = page.getViewport({ scale: 1 });
      const aspectRatio = viewport.width / viewport.height;
      if (pageNum === 1) {
        setDefaultAspectRatio(aspectRatio);
      }

      setPageSizes(prev => {
        const next = new Map(prev);
        next.set(pageNum, {
          width: viewport.width,
          height: viewport.height,
          aspectRatio,
        });
        pageSizesRef.current = next;
        return next;
      });

      const pageSize = pageSizesRef.current.get(pageNum) || {
        width: viewport.width,
        height: viewport.height,
        aspectRatio,
      };

      let finalScale: number;
      if (viewMode === "grid") {
        const columnCount = 4;
        const gap = 16;
        const padding = 32;
        const availableWidth = containerWidth - padding - (columnCount - 1) * gap;
        const cellWidth = availableWidth / columnCount;
        finalScale = (cellWidth / pageSize.width) * scale;
      } else {
        const padding = 32;
        const availableWidth = containerWidth - padding;
        finalScale = (availableWidth / pageSize.width) * scale;
      }

      const scaledViewport = page.getViewport({ scale: finalScale });
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(scaledViewport.width * outputScale);
      canvas.height = Math.floor(scaledViewport.height * outputScale);
      canvas.style.width = `${scaledViewport.width}px`;
      canvas.style.height = `${scaledViewport.height}px`;

      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
        transform: [outputScale, 0, 0, outputScale, 0, 0],
      }).promise;

      renderedPagesRef.current.add(pageNum);
      setRenderedPages(new Set(renderedPagesRef.current));
    } catch (err) {
      console.error(`Error rendering page ${pageNum}:`, err);
    } finally {
      renderRunningRef.current = false;
    }
  }, [pdfDoc, scale, viewMode, containerWidth]);

  // 按页顺序串行加载，避免并发拉取整份 PDF
  useEffect(() => {
    if (!pdfDoc || !totalPages) return;

    renderedPagesRef.current = new Set();
    renderRunningRef.current = false;
    setRenderedPages(new Set());

    let cancelled = false;
    const loadPages = async () => {
      for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
        if (cancelled) break;
        await renderPage(pageNum);
        if (cancelled || pageNum === totalPages) break;
        await new Promise<void>((resolve) => {
          const scheduler = window.requestIdleCallback ?? window.requestAnimationFrame;
          if (scheduler === window.requestIdleCallback) {
            window.requestIdleCallback(() => resolve());
          } else {
            window.requestAnimationFrame(() => resolve());
          }
        });
      }
    };

    void loadPages();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, totalPages, scale, viewMode, containerWidth, renderPage]);

  // 缩放控制
  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 2));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.2));
  };

  // 切换视图模式
  const toggleViewMode = () => {
    setViewMode(prev => prev === "grid" ? "list" : "grid");
  };

  // 计算页面容器的样式
  const getPageContainerStyle = useCallback((pageNum: number): React.CSSProperties => {
    const pageSize = pageSizes.get(pageNum);
    if (!pageSize || !containerWidth) {
      const fallbackAspectRatio = defaultAspectRatio || 0.75;
      return {
        width: "100%",
        aspectRatio: fallbackAspectRatio,
        minHeight: viewMode === "list" ? 320 : 200,
      };
    }

    let finalScale: number;
    if (viewMode === "grid") {
      const columnCount = 4;
      const gap = 16;
      const padding = 32;
      const availableWidth = containerWidth - padding - (columnCount - 1) * gap;
      const cellWidth = availableWidth / columnCount;
      finalScale = (cellWidth / pageSize.width) * scale;
    } else {
      const padding = 32;
      const availableWidth = containerWidth - padding;
      finalScale = (availableWidth / pageSize.width) * scale;
    }

    const width = pageSize.width * finalScale;
    const height = pageSize.height * finalScale;

    return {
      width: viewMode === "list" ? '100%' : width,
      height: height,
      minHeight: height,
    };
  }, [pageSizes, viewMode, scale, containerWidth, defaultAspectRatio]);

  // 生成页面 Canvas 元素
  const pagesToDisplay = totalPages;
  const pageElements = Array.from({ length: pagesToDisplay }, (_, i) => i + 1);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] bg-gray-50 rounded-lg">
        <Loader2 className="w-10 h-10 text-[#005BA3] animate-spin" />
        <p className="mt-4 text-[#64748B]">正在加载 PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-[#64748B] bg-gray-50 rounded-lg">
        <FileText className="w-16 h-16 mb-4 text-gray-300" />
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!pdfDoc || totalPages === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-[#64748B] bg-gray-50 rounded-lg">
        <FileText className="w-16 h-16 mb-4 text-gray-300" />
        <p>暂无预览</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-3 px-2 sticky top-0 bg-white z-10 py-2 border-b">
        <div className="flex items-center gap-2">
          {/* 视图切换 */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleViewMode}
            className="h-8 px-2"
            title={viewMode === "grid" ? "切换到列表视图" : "切换到网格视图"}
          >
            {viewMode === "grid" ? (
              <><LayoutList className="w-4 h-4 mr-1" /> 列表</>
            ) : (
              <><Grid3X3 className="w-4 h-4 mr-1" /> 网格</>
            )}
          </Button>
          
          {/* 缩放控制 */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={scale <= 0.2}
              className="h-8 w-8 p-0"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-[#64748B] min-w-[50px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={scale >= 2}
              className="h-8 w-8 p-0"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 页数显示 */}
        <div className="text-sm text-[#64748B]">
          共 <span className="font-semibold text-[#1E293B]">{totalPages}</span> 页
        </div>
      </div>

      {/* PDF 平铺渲染区域 */}
      <div 
        ref={containerRef}
        className={`bg-gray-100 rounded-lg p-4 overflow-auto max-h-[70vh] ${
          viewMode === "grid" 
            ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 auto-rows-auto" 
            : "flex flex-col gap-4"
        }`}
      >
        {pageElements.map((pageNum) => {
          const containerStyle = getPageContainerStyle(pageNum);
          const isRendered = renderedPages.has(pageNum);
          
          return (
            <div 
              key={pageNum} 
              ref={(el) => {
                pageRefs.current.set(pageNum, el);
              }}
              data-page-num={pageNum}
              className={`relative bg-white rounded-lg shadow-sm overflow-hidden flex-shrink-0 ${
                viewMode === "list" ? "w-full" : ""
              }`}
              style={containerStyle}
            >
              {/* 页码标签 */}
              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded z-10">
                第 {pageNum} 页
              </div>
              
              {/* 加载占位 */}
              {!isRendered && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                  <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                </div>
              )}
              
              <canvas
                id={`pdf-canvas-${pageNum}`}
                className="block"
                style={{ display: 'block' }}
              />
            </div>
          );
        })}
      </div>

      {/* 页面提示 */}
      <div className="text-center text-sm text-[#64748B] mt-3">
        已按页顺序加载全部 {pagesToDisplay} 页，不会并发拉取整份 PDF
      </div>
    </div>
  );
}
