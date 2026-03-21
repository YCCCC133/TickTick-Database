# 嘀嗒资料库 / 期末资料共享平台

一个基于 **Next.js 16 + React 19 + TypeScript** 的资料共享平台，面向课程资料、试卷、笔记、课件和文件预览场景。

项目当前实现了：
- 登录、注册、会话刷新与个人资料管理
- 资料上传、批量上传、分片上传、下载和预览
- 腾讯云 PostgreSQL 数据库 + 自定义认证
- 腾讯云 COS 文件存储
- 评论、评分、积分、精选、审核和后台管理
- 可选的 LLM 智能分类能力

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 16（App Router） |
| 运行时 | React 19、TypeScript 5 |
| UI | Tailwind CSS 4、shadcn/ui、Radix UI |
| 数据库 | 腾讯云 PostgreSQL |
| 认证 | 自定义邮件密码认证 |
| 文件存储 | 腾讯云 COS |
| 表单 / 校验 | React Hook Form、Zod |
| 图表 | Recharts |
| 部署脚本 | Bash + Next.js CLI |

## 项目结构

```text
project-full-export/
├── src/
│   ├── app/                 # 页面路由与 API 路由
│   │   ├── page.tsx         # 首页
│   │   ├── admin/           # 管理后台页面
│   │   └── api/             # 后端接口
│   ├── components/          # 页面组件与 UI 组件
│   ├── contexts/            # 全局状态（认证、积分等）
│   ├── hooks/               # 自定义 Hooks
│   ├── lib/                 # 工具、缓存、存储、积分逻辑
│   ├── storage/database/    # 自定义数据库访问层与共享定义
│   └── types/               # TypeScript 类型
├── supabase/migrations/     # 数据库迁移 SQL（历史目录名）
├── scripts/                 # dev/build/start/prepare 脚本
├── public/                  # 静态资源
├── package.json
└── next.config.ts
```

## 核心模块划分

- `src/app`：页面入口、App Router、API 路由、管理后台
- `src/components`：首页卡片、上传弹窗、预览器、对话框、shadcn/ui 基础组件
- `src/contexts/AuthContext.tsx`：会话恢复、登录/注册、token 刷新、积分缓存
- `src/lib/storage.ts`：腾讯云 COS 上传、下载 URL、文件读取
- `src/lib/points.ts`：积分增减、交易记录、奖励逻辑
- `src/storage/database`：自定义数据库访问层、表结构、关系和类型
- `supabase/migrations`：数据库初始化和增量 SQL

## 数据流

### 1. 登录与会话
1. 用户在前端提交邮箱和密码。
2. `/api/auth/login` 调用 自定义认证。
3. 返回的 session、profile、points 写入 `localStorage`，同时设置 `auth_token` cookie。
4. `AuthContext` 自动刷新 token，并在 `/api/auth/me` 中同步用户资料与积分。

### 2. 首页加载
1. 首页请求 `/api/categories` 和 `/api/files`。
2. 文件列表只展示 `is_active = true` 的资料。
3. 预览图、分类、上传者信息和评论数在后端聚合后返回。
4. 首页默认按“综合推荐”排序，并带有缓存。

### 3. 资料上传
1. 前端通过上传弹窗提交文件。
2. `/api/files/upload`、`/api/files/upload-chunked` 或 `/api/files/batch-upload` 接收文件。
3. 文件写入腾讯云 COS，数据库保存文件元数据。
4. 可选地触发 AI 分类、标签生成和预览图处理。
5. 资料进入待审核或已上架流程，最终由管理员在后台审核。

### 4. 资料下载
1. 用户点击下载后请求 `/api/files/[id]/download`。
2. 后端检查登录状态、文件状态和积分余额。
3. 普通用户下载会扣除积分，上传者和管理员/志愿者通常不扣分。
4. 后端返回代理下载地址，前端再发起实际下载。

### 5. 预览与代理
1. PDF/图片/Office 预览通常不直接暴露 COS 原始地址。
2. `/api/files/[id]/preview`、`/api/files/[id]/thumbnail`、`/api/files/[id]/proxy` 等接口提供代理访问。
3. 这样可以规避 COS 直链 403 和跨域问题。

## 主要功能

- 首页资料浏览、搜索、筛选、分页和排序
- 资料上传、分片上传、批量上传
- PDF 预览、缩略图和文件代理访问
- 登录、注册、token 刷新、资料编辑
- 评分、评论、精选、积分和下载扣分
- 管理后台：用户、文件、积分、审核、统计、AI 分类
- 访问统计与日志类接口

## 运行前准备

- Node.js 18+（建议使用与当前 Next.js 版本兼容的稳定版本）
- pnpm 9+
- 腾讯云 PostgreSQL 实例
- 腾讯云 COS 存储桶
- 可选：LLM API Key

项目通过 `preinstall` 强制使用 pnpm，`npm` / `yarn` 不建议使用。

## 环境变量

复制示例文件：

```bash
cp .env.example .env.local
```

建议至少配置以下变量：

| 变量 | 必需 | 说明 |
|---|---:|---|
| `DATABASE_URL` | 是 | 腾讯云 PostgreSQL 直连地址 |
| `COS_SECRET_ID` / `TENCENT_SECRET_ID` | 是 | 腾讯云 COS SecretId |
| `COS_SECRET_KEY` / `TENCENT_SECRET_KEY` | 是 | 腾讯云 COS SecretKey |
| `COS_BUCKET_NAME` | 是 | COS Bucket 名称 |
| `COS_REGION` | 是 | COS 地域，例如 `ap-guangzhou` |
| `LLM_API_KEY` | 否 | 智能分类用的模型 API Key |
| `LLM_BASE_URL` | 否 | LLM 接口地址 |
| `LLM_MODEL` | 否 | 模型名称 |
| `COZE_PROJECT_DOMAIN_DEFAULT` | 否 | 用于生成代理 URL 的默认域名 |
| `PGDATABASE_URL` | 否 | PostgreSQL 直连地址，偏迁移/维护用途 |

> 说明：代码中的数据库层会优先读取 `DATABASE_URL`，其次读取 `PGDATABASE_URL`；COS 相关逻辑读取 `COS_*` 变量。

## 数据库初始化

数据库结构在 `supabase/migrations/` 下。初始化时请按文件名顺序在腾讯云数据库 SQL 客户端中执行：

1. `001_profiles_complete.sql`
2. `003_points_system.sql`
3. `004_add_preview_url.sql`
4. `005_real_name_verification.sql`
5. `006_set_admin.sql`
6. `007_comments_ratings.sql`
7. `008_add_is_featured.sql`
8. `009_add_review_fields.sql`

如果需要快速修复管理员或诊断问题，可参考仓库中的历史 SQL 文件，按需执行即可。

## 本地运行

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env.local

# 3. 初始化数据库迁移
#    在腾讯云 PostgreSQL 实例中逐个执行 `supabase/migrations/*.sql`

# 4. 启动开发服务器
pnpm dev
```

开发服务器默认运行在：

- `http://localhost:5000`

## 常用脚本

```bash
pnpm dev       # 开发模式，端口 5000
pnpm build     # 构建生产版本
pnpm start     # 启动生产服务，端口 5000
pnpm lint      # ESLint 检查
pnpm ts-check  # TypeScript 类型检查
```

脚本实际调用的是 `scripts/dev.sh`、`scripts/build.sh`、`scripts/start.sh` 和 `scripts/prepare.sh`。

## GitHub 同步

如果你要把项目持续同步到 GitHub，请先阅读 `docs/GITHUB_SYNC.md`。  
里面包含：

- Git 仓库初始化与 remote 绑定
- 首次推送
- 日常同步脚本 `scripts/sync-github.sh`
- `.gitignore` 已忽略的内容说明

## API 概览

### 认证
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### 文件
- `GET /api/files`
- `GET /api/files/[id]`
- `DELETE /api/files/[id]`
- `GET /api/files/[id]/download`
- `POST /api/files/upload`
- `POST /api/files/upload-chunked`
- `POST /api/files/batch-upload`
- `POST /api/files/classify`
- `GET /api/files/[id]/preview`
- `GET /api/files/[id]/thumbnail`
- `GET /api/files/[id]/proxy`

### 业务
- `GET /api/categories`
- `GET /api/featured`
- `GET /api/points`
- `GET /api/profile`
- `GET /api/ratings`
- `GET /api/comments`
- `GET /api/admin/*`
- `POST /api/analytics/track`

## 部署说明

仓库当前没有 `Dockerfile` 或 `docker-compose.yml`，因此默认部署方式是：

1. 在目标环境安装 Node.js 和 pnpm
2. 配置 `.env.local`
3. 执行 `pnpm install`
4. 执行 `pnpm build`
5. 执行 `pnpm start`

如果你需要容器化部署，需要自行补充 Docker 配置。

## 开发建议

- 优先复用 `src/components/ui/` 中的基础组件
- 新增业务逻辑优先放在 `src/lib` 或 `src/storage/database`
- 需要对外暴露的能力，优先通过 API route 封装，不直接在前端访问数据库
- 文件访问尽量走代理 URL，不直接暴露 COS 原始地址
- 上传/下载/审核相关改动后，至少做一次 `pnpm lint` 和 `pnpm ts-check`
- Git 提交前可以先执行 `bash scripts/setup-git-hooks.sh`，启用 pre-commit 自动检查
- 如果你要自动同步到 GitHub，可以后台运行 `bash scripts/auto-sync-github.sh`

## 备注

- 首页默认只展示 `is_active = true` 的文件
- 管理后台入口在 `/admin`
- 预览图、下载链接和头像上传都走后端代理逻辑
- 项目中包含 AI 分类、统计和积分系统，但是否启用取决于环境变量和 数据库表结构
