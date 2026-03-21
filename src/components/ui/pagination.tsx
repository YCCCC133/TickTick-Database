"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useState, useCallback, useEffect } from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  showTotal?: boolean;
  showQuickJumper?: boolean;
  pageSize?: number;
}

/**
 * 稳定的分页组件
 * - 三栏布局：左侧总数、中间分页按钮、右侧快速跳转
 * - 固定按钮位置，不随页码数量变化而移动
 * - 支持页码显示和快速跳转
 */
export function Pagination({
  currentPage,
  totalPages,
  total,
  onPageChange,
  showTotal = true,
  showQuickJumper = true,
  pageSize = 15,
}: PaginationProps) {
  const [inputPage, setInputPage] = useState("");

  // 当总页数变化时清空输入
  useEffect(() => {
    setInputPage("");
  }, [totalPages]);

  // 生成页码数组
  const getPageNumbers = useCallback(() => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 7) {
      // 7页以内全部显示
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 超过7页，显示部分页码
      pages.push(1);
      
      if (currentPage <= 4) {
        // 当前页在前面
        for (let i = 2; i <= 5; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        // 当前页在后面
        pages.push("...");
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // 当前页在中间
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      }
    }
    
    return pages;
  }, [currentPage, totalPages]);

  // 跳转到指定页
  const handleGoToPage = useCallback(() => {
    const page = parseInt(inputPage);
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
      setInputPage("");
    }
  }, [inputPage, totalPages, onPageChange]);

  // 处理输入框回车
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleGoToPage();
    }
  }, [handleGoToPage]);

  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers();

  return (
    <div className="grid grid-cols-3 items-center mt-6 pt-4 border-t border-[#E2E8F0]">
      {/* 左侧：总数显示（固定宽度，左对齐） */}
      <div className="justify-self-start">
        {showTotal && total !== undefined && (
          <div className="text-sm text-[#64748B] whitespace-nowrap">
            共 <span className="font-medium text-[#1E293B]">{total}</span> 条
          </div>
        )}
      </div>

      {/* 中间：分页控制（居中，固定最大宽度） */}
      <div className="justify-self-center flex items-center gap-1">
        {/* 首页按钮 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="min-w-[32px] h-8 px-2 shrink-0"
        >
          <ChevronsLeft className="w-4 h-4" />
        </Button>

        {/* 上一页按钮 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="min-w-[32px] h-8 px-2 shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        {/* 页码按钮区域（固定最小宽度，防止抖动） */}
        <div className="flex items-center gap-1 min-w-[200px] justify-center">
          {pageNumbers.map((page, index) => (
            page === "..." ? (
              <span 
                key={`ellipsis-${index}`} 
                className="w-8 h-8 flex items-center justify-center text-sm text-[#64748B] shrink-0"
              >
                ...
              </span>
            ) : (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(page as number)}
                className={`min-w-[32px] h-8 px-0 shrink-0 ${
                  currentPage === page 
                    ? "bg-[#005BA3] hover:bg-[#004A8C]" 
                    : ""
                }`}
              >
                {page}
              </Button>
            )
          ))}
        </div>

        {/* 下一页按钮 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="min-w-[32px] h-8 px-2 shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* 末页按钮 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="min-w-[32px] h-8 px-2 shrink-0"
        >
          <ChevronsRight className="w-4 h-4" />
        </Button>
      </div>

      {/* 右侧：快速跳转（固定宽度，右对齐） */}
      <div className="justify-self-end">
        {showQuickJumper && totalPages > 7 && (
          <div className="flex items-center gap-1">
            <span className="text-sm text-[#64748B] whitespace-nowrap">跳至</span>
            <input
              type="number"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder=""
              className="w-12 h-8 text-sm text-center border border-[#E2E8F0] rounded-md px-1 focus:outline-none focus:ring-2 focus:ring-[#005BA3]/20 focus:border-[#005BA3]"
              min={1}
              max={totalPages}
            />
            <span className="text-sm text-[#64748B] whitespace-nowrap">页</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoToPage}
              className="h-8 px-3 ml-1"
            >
              跳转
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
