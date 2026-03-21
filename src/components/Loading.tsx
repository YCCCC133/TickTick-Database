"use client";

import { cn } from "@/lib/utils";

interface LoadingProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  text?: string;
}

export function Loading({ className, size = "md", text }: LoadingProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div 
        className={cn(
          "rounded-full border-2 border-[#E2E8F0] border-t-[#005BA3] animate-spin",
          sizeClasses[size]
        )}
      />
      {text && <p className="text-sm text-[#64748B]">{text}</p>}
    </div>
  );
}

interface FileCardSkeletonProps {
  count?: number;
}

export function FileCardSkeleton({ count = 6 }: FileCardSkeletonProps) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 bg-white border border-[#E2E8F0] rounded-lg animate-pulse"
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          {/* 预览图骨架 */}
          <div className="w-16 h-20 flex-shrink-0 rounded-md bg-gradient-to-br from-[#F0F7FF] to-[#E0F0FF]" />
          
          {/* 信息区骨架 */}
          <div className="flex-1 min-w-0">
            <div className="h-4 bg-[#F1F5F9] rounded w-3/4 mb-2" />
            <div className="h-3 bg-[#F1F5F9] rounded w-1/2 mb-2" />
            <div className="flex gap-4">
              <div className="h-3 bg-[#F1F5F9] rounded w-10" />
              <div className="h-3 bg-[#F1F5F9] rounded w-10" />
              <div className="h-3 bg-[#F1F5F9] rounded w-12" />
            </div>
          </div>
          
          {/* 按钮骨架 */}
          <div className="w-16 h-7 bg-[#F1F5F9] rounded-md flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
