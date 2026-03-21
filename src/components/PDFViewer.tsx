"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, FileText, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensurePdfJsLoaded } from "@/lib/pdfjs-loader";

interface PDFViewerProps {
  url: string;
  className?: string;
}

type PdfPage = {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    transform?: number[];
  }): { promise: Promise<void> };
};

type PdfDocumentLike = {
  numPages: number;
  destroy(): void;
  getPage(pageNumber: number): Promise<PdfPage>;
};

export function PDFViewer({ url, className = "" }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentLike | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [pdfLibReady, setPdfLibReady] = useState(false);
  const [scale, setScale] = useState(0.5); // 默认缩放50%
  const [inputPage, setInputPage] = useState("");

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
      setCurrentPage(1);

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
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [url, pdfLibReady]);

  // 渲染指定页面
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    setRendering(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      // 计算合适的缩放比例
      const containerWidth = canvas.parentElement?.clientWidth || 600;
      const viewport = page.getViewport({ scale: 1 });
      const baseScale = containerWidth / viewport.width;
      const finalScale = baseScale * scale;

      const scaledViewport = page.getViewport({ scale: finalScale });

      // 支持高 DPI 显示
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
    } catch (err) {
      console.error("Error rendering page:", err);
    } finally {
      setRendering(false);
    }
  }, [pdfDoc, scale]);

  // 当前页面改变时重新渲染
  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, renderPage]);

  // 窗口大小改变时重新渲染
  useEffect(() => {
    const handleResize = () => {
      if (pdfDoc && currentPage) {
        renderPage(currentPage);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [pdfDoc, currentPage, renderPage]);

  // 上一页
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // 下一页
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // 跳转到指定页
  const handleGoToPage = () => {
    const page = parseInt(inputPage);
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setInputPage("");
    }
  };

  // 缩放
  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  // 生成页码按钮
  const renderPageButtons = () => {
    const buttons: (number | string)[] = [];
    
    if (totalPages <= 7) {
      // 页数少，显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        buttons.push(i);
      }
    } else {
      // 页数多，显示部分页码
      buttons.push(1);
      
      if (currentPage > 3) {
        buttons.push("...");
      }
      
      // 当前页附近的页码
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        buttons.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        buttons.push("...");
      }
      
      buttons.push(totalPages);
    }
    
    return buttons;
  };

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3 px-2 pr-10">
        {/* 缩放控制 */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="h-8 w-8 p-0"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm text-[#64748B] min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomIn}
            disabled={scale >= 3}
            className="h-8 w-8 p-0"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        {/* 页数显示 */}
        <div className="text-sm text-[#64748B] sm:text-right">
          第 <span className="font-semibold text-[#1E293B]">{currentPage}</span> 页，
          共 <span className="font-semibold text-[#1E293B]">{totalPages}</span> 页
        </div>
      </div>

      {/* PDF 渲染区域 */}
      <div className="relative bg-gray-100 rounded-lg p-4 flex items-center justify-center min-h-[300px] overflow-auto">
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
            <Loader2 className="w-8 h-8 text-[#005BA3] animate-spin" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto shadow-lg rounded border border-gray-200"
        />
      </div>

      {/* 页面控制 - 三栏布局，固定按钮位置 */}
      <div className="grid grid-cols-3 items-center mt-4 gap-2">
        {/* 左侧：上一页按钮 */}
        <div className="justify-self-start">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="h-8 px-3"
          >
            <ChevronLeft className="w-4 h-4" />
            上一页
          </Button>
        </div>

        {/* 中间：页码按钮（固定最小宽度，防止抖动） */}
        <div className="justify-self-center flex items-center gap-1 min-w-[200px] justify-center">
          {renderPageButtons().map((page, index) => (
            page === "..." ? (
              <span key={`ellipsis-${index}`} className="px-2 text-[#64748B] w-8 text-center shrink-0">...</span>
            ) : (
              <button
                key={page}
                onClick={() => setCurrentPage(page as number)}
                className={`w-8 h-8 rounded-md text-sm font-medium transition-colors shrink-0 ${
                  currentPage === page
                    ? "bg-[#005BA3] text-white"
                    : "bg-gray-100 text-[#64748B] hover:bg-gray-200"
                }`}
              >
                {page}
              </button>
            )
          ))}
        </div>

        {/* 右侧：下一页按钮 + 跳转 */}
        <div className="justify-self-end flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="h-8 px-3"
          >
            下一页
            <ChevronRight className="w-4 h-4" />
          </Button>

          {/* 跳转输入 */}
          {totalPages > 10 && (
            <div className="flex items-center gap-1">
              <span className="text-sm text-[#64748B]">跳至</span>
              <input
                type="number"
                value={inputPage}
                onChange={(e) => setInputPage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGoToPage()}
                placeholder="页码"
                className="w-14 h-8 text-sm text-center border rounded-md px-1"
                min={1}
                max={totalPages}
              />
              <span className="text-sm text-[#64748B]">页</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoToPage}
                className="h-8 px-2"
              >
                跳转
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
