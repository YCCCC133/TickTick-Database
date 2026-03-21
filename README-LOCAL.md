# 期末资料共享平台 - 本地部署指南

## 项目简介

这是一个基于 **Next.js 16** 的期末资料共享平台，支持：

- 📁 **文件上传下载** - 支持多种格式（PDF、Word、Excel、PPT、图片等）
- 🏷️ **AI 智能分类** - 使用 LLM 自动分析文件内容并分类
- 💰 **积分系统** - 上传赚积分，下载消耗积分
- 👤 **用户认证** - 注册、登录、实名认证
- ⭐ **评分评论** - 对资料进行评分和评论
- 🛡️ **审核系统** - 管理员审核后才能上架
- 📊 **数据统计** - 管理后台数据看板

---

## 技术栈

| 类型 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 前端 | React 19 + TypeScript |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 数据库 | Supabase (PostgreSQL) |
| 文件存储 | 腾讯云 COS |
| AI | LLM API（支持豆包/DeepSeek/Kimi） |
| 图表 | Recharts |

---

## 环境要求

- Node.js 18+
- pnpm（推荐）或 npm

---

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，填入真实配置：

```bash
cp .env.example .env.local
```

### 3. 初始化数据库

在 Supabase 控制台的 SQL Editor 中，依次执行 `supabase/migrations/` 目录下的迁移脚本：

1. `001_profiles_complete.sql` - 用户表
2. `003_points_system.sql` - 积分系统
3. `004_add_preview_url.sql` - 预览图字段
4. `005_real_name_verification.sql` - 实名认证
5. `006_set_admin.sql` - 设置管理员
6. `007_comments_ratings.sql` - 评论评分
7. `008_add_is_featured.sql` - 精选字段
8. `009_add_review_fields.sql` - 审核字段

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:5000

---

## 项目结构

```
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API 路由
│   │   │   ├── auth/          # 认证接口（登录、注册、刷新token）
│   │   │   ├── files/         # 文件接口（上传、下载、预览、分类）
│   │   │   ├── admin/         # 管理后台接口
│   │   │   ├── categories/    # 分类接口
│   │   │   ├── comments/      # 评论接口
│   │   │   ├── ratings/       # 评分接口
│   │   │   └── points/        # 积分接口
│   │   ├── admin/             # 管理后台页面
│   │   ├── layout.tsx         # 根布局
│   │   └── page.tsx           # 首页
│   ├── components/            # React 组件
│   │   ├── ui/               # shadcn/ui 组件库
│   │   ├── FileCard.tsx      # 文件卡片
│   │   ├── FileDetailDialog.tsx # 文件详情弹窗
│   │   ├── FileUploadDialog.tsx # 文件上传弹窗
│   │   ├── PDFViewer.tsx     # PDF 预览器
│   │   └── ...
│   ├── contexts/              # React Context
│   │   └── AuthContext.tsx   # 认证上下文
│   ├── hooks/                 # 自定义 Hooks
│   ├── lib/                   # 工具库
│   │   ├── storage.ts        # 文件存储（腾讯云COS）
│   │   ├── cache.ts          # 缓存
│   │   └── utils.ts          # 工具函数
│   ├── storage/               # 数据库配置
│   │   └── database/
│   │       └── supabase-client.ts
│   └── types/                 # TypeScript 类型定义
├── supabase/
│   └── migrations/            # 数据库迁移脚本
├── public/                    # 静态资源
├── package.json
├── tsconfig.json
├── next.config.ts
└── .env.local                 # 环境变量（需自行创建）
```

---

## 核心功能说明

### 文件上传流程

1. 前端选择文件 → 支持批量上传
2. PDF 自动压缩（大于 10MB 时）
3. 上传到腾讯云 COS
4. 调用 AI 接口分析文件内容
5. 自动分类 + 生成标签
6. 保存到数据库（默认待审核状态）

### 文件下载流程

1. 检查用户积分
2. 扣除积分（首次下载）
3. 通过代理接口返回文件
4. 记录下载次数

### 审核流程

1. 用户上传 → 状态：待审核
2. AI 自动分类（标记 ai_classified_at）
3. 管理员审核 → 通过/拒绝
4. 审核通过 → 状态：已上架（is_active=true）

---

## 环境变量说明

详见 `.env.example` 文件。

---

## 常见问题

### Q: PDF 预览失败？

检查：
1. 腾讯云 COS 配置是否正确
2. 文件是否为标准 PDF 格式
3. 浏览器控制台是否有错误

### Q: AI 分类不工作？

检查：
1. LLM_API_KEY 是否正确
2. LLM_BASE_URL 是否可访问
3. 文件内容是否为空

### Q: 登录后刷新页面丢失状态？

检查：
1. Supabase 配置是否正确
2. 浏览器是否禁用了 localStorage/cookie

---

## 默认账号

首次部署后需要手动创建管理员账号：

1. 注册普通账号
2. 在 Supabase 控制台执行：
```sql
UPDATE profiles SET role = 'admin' WHERE user_id = '你的用户ID';
```

---

## 联系方式

如有问题，请提交 Issue 或联系开发者。
