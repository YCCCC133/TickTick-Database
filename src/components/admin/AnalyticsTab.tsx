"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { Download, TrendingUp, Users, Activity, Calendar, FileText } from "lucide-react";

type AnalyticsData = {
  period: string;
  summary: {
    totalViews: number;
    uniqueVisitors: number;
    avgViewsPerDay: number;
    viewsGrowth: string;
  };
  dailyStats: { date: string; views: number; uniqueVisitors: number }[];
  pageTypeStats: Record<string, number>;
  topPages: { path: string; count: number }[];
  dateRange?: { start: string; end: string };
};

type Props = {
  analyticsData: AnalyticsData | null;
  analyticsLoading: boolean;
  analyticsPeriod: string;
  setAnalyticsPeriod: (value: string) => void;
  exportAnalyticsReport: () => void;
};

export default function AnalyticsTab({
  analyticsData,
  analyticsLoading,
  analyticsPeriod,
  setAnalyticsPeriod,
  exportAnalyticsReport,
}: Props) {
  const typeLabels: Record<string, string> = {
    home: "首页",
    file_detail: "文件详情",
    download: "下载页",
    profile: "个人中心",
    rankings: "排行榜",
    search: "搜索页",
    admin: "管理后台",
    page: "其他页面",
    event: "事件追踪",
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#1E293B] flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#005BA3]" />
            流量统计
          </h2>
          <p className="text-sm text-[#64748B] mt-1">查看页面访问趋势与热门页面</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
            <SelectTrigger className="w-[140px] bg-white">
              <SelectValue placeholder="选择时间范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">今天</SelectItem>
              <SelectItem value="7days">近7天</SelectItem>
              <SelectItem value="30days">近30天</SelectItem>
              <SelectItem value="90days">近90天</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={exportAnalyticsReport}
            disabled={analyticsLoading || !analyticsData}
            className="bg-white"
          >
            <Download className="w-4 h-4 mr-2" />
            导出
          </Button>
        </div>
      </div>

      {analyticsLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-[#005BA3] border-t-transparent rounded-full" />
        </div>
      )}

      {!analyticsLoading && analyticsData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="neu-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#64748B]">总访问量</p>
                  <p className="text-2xl font-bold text-[#1E293B]">{analyticsData.summary.totalViews.toLocaleString()}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-[#005BA3]" />
              </div>
            </div>
            <div className="neu-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#64748B]">独立访客</p>
                  <p className="text-2xl font-bold text-[#1E293B]">{analyticsData.summary.uniqueVisitors.toLocaleString()}</p>
                </div>
                <Users className="w-8 h-8 text-[#7C3AED]" />
              </div>
            </div>
            <div className="neu-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#64748B]">日均访问</p>
                  <p className="text-2xl font-bold text-[#1E293B]">{analyticsData.summary.avgViewsPerDay.toLocaleString()}</p>
                </div>
                <Calendar className="w-8 h-8 text-[#16A34A]" />
              </div>
            </div>
            <div className="neu-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#64748B]">增长率</p>
                  <p className="text-2xl font-bold text-[#1E293B]">{analyticsData.summary.viewsGrowth}%</p>
                </div>
                <FileText className="w-8 h-8 text-[#F59E0B]" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 mb-6">
            <h3 className="text-lg font-semibold text-[#1E293B] mb-4">访问趋势</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData.dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" stroke="#94A3B8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="views" stroke="#005BA3" fill="#DBEAFE" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-[#1E293B] mb-4">页面类型分布</h3>
              <div className="space-y-3">
                {Object.entries(analyticsData.pageTypeStats)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const total = Object.values(analyticsData.pageTypeStats).reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-[#475569]">{typeLabels[type] || type}</span>
                            <span className="text-sm font-medium text-[#1E293B]">
                              {count.toLocaleString()} ({percentage}%)
                            </span>
                          </div>
                          <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                            <div className="h-full bg-[#005BA3] rounded-full transition-all" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-[#1E293B] mb-4">热门页面 TOP 10</h3>
              <div className="space-y-2">
                {analyticsData.topPages.map((page, index) => (
                  <div key={page.path} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F8FAFC]">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index < 3 ? "bg-[#005BA3] text-white" : "bg-[#E2E8F0] text-[#64748B]"
                    }`}>
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm text-[#475569] truncate">{page.path === "/" ? "首页" : page.path}</span>
                    <span className="text-sm font-medium text-[#005BA3]">{page.count.toLocaleString()}</span>
                  </div>
                ))}
                {analyticsData.topPages.length === 0 && (
                  <div className="text-center py-8 text-[#94A3B8]">暂无数据</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {!analyticsLoading && !analyticsData && (
        <div className="text-center py-12 text-[#94A3B8]">暂无流量数据</div>
      )}
    </div>
  );
}
