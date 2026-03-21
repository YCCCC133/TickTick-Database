"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function Empty({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className 
}: EmptyProps) {
  return (
    <div className={cn("glass-card p-12 text-center", className)}>
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-[#F1F5F9] flex items-center justify-center mx-auto mb-4">
          <Icon className="w-8 h-8 text-[#64748B]" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-[#1E293B] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[#64748B] mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
