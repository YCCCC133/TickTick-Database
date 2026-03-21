import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";

export const metadata: Metadata = {
  title: "嘀嗒资料库 | 学习资料共享平台",
  description: "嘀嗒资料库上传下载系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AuthProvider>
          <AnalyticsTracker />
          {children}
          <Toaster 
            position="top-center"
            toastOptions={{
              style: {
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0, 91, 163, 0.08)',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
