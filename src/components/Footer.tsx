"use client";

import { Mail, ExternalLink, Code, BookOpen, Github, Server, Heart } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  // 实用技术网站链接
  const techLinks = [
    { name: "MDN", url: "https://developer.mozilla.org/", icon: BookOpen },
    { name: "GitHub", url: "https://github.com/", icon: Github },
    { name: "Stack Overflow", url: "https://stackoverflow.com/", icon: Code },
    { name: "Can I Use", url: "https://caniuse.com/", icon: Server },
  ];

  // 技术栈
  const techStack = ["Next.js", "React", "TypeScript", "Tailwind", "PostgreSQL", "COS"];

  return (
    <footer className="bg-gradient-to-b from-white to-[#F8FAFC] border-t border-[#E2E8F0]">
      <div className="container mx-auto px-6">
        {/* 主内容区 - 更紧凑的布局 */}
        <div className="py-6 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* 网站信息 */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <h3 className="font-bold text-[#1E293B] text-lg mb-2">嘀嗒资料库</h3>
            <p className="text-sm text-[#64748B] leading-relaxed mb-3">
              嘀嗒资料库共享平台
            </p>
            <a 
              href="mailto:2036189128@qq.com"
              className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#005BA3] transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>2036189128@qq.com</span>
            </a>
          </div>

          {/* 技术栈 - 居中对齐 */}
          <div className="flex flex-col items-center">
            <h3 className="font-semibold text-[#1E293B] text-sm mb-3">技术栈</h3>
            <div className="flex flex-wrap justify-center gap-1.5">
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="px-2 py-0.5 text-xs rounded-md bg-[#F0F7FF] text-[#005BA3] font-medium"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* 开发者资源 - 右对齐 */}
          <div className="flex flex-col items-center md:items-end">
            <h3 className="font-semibold text-[#1E293B] text-sm mb-3">开发者资源</h3>
            <div className="flex flex-wrap justify-center md:justify-end gap-x-4 gap-y-2">
              {techLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[#64748B] hover:text-[#005BA3] transition-colors"
                >
                  <link.icon className="w-3.5 h-3.5" />
                  <span>{link.name}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="border-t border-[#E2E8F0]"></div>

        {/* 底部信息 - 单行紧凑布局 */}
        <div className="py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* 版权 + 备案 */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#94A3B8]">
            <span>© {currentYear} 嘀嗒资料库</span>
            <span className="hidden sm:inline">·</span>
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#64748B] transition-colors"
            >
              京ICP备2024XXXXXX号
            </a>
            <span className="hidden sm:inline">·</span>
            <a
              href="http://www.beian.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#64748B] transition-colors flex items-center gap-1"
            >
              <span className="w-2.5 h-2.5 rounded-sm bg-[#005BA3] flex items-center justify-center">
                <span className="text-white text-[6px] font-bold">公</span>
              </span>
              京公网安备
            </a>
          </div>

          {/* 服务器状态 */}
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-green-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              服务正常
            </span>
            <span className="flex items-center gap-1 text-[#94A3B8]">
              Made with <Heart className="w-3 h-3 text-red-400 fill-red-400" />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
