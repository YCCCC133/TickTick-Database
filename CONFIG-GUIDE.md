# 配置信息说明

## 当前已提供的配置

以下配置已在 `.env.local.backup` 中提供，可直接使用：

| 配置项 | 状态 | 说明 |
|--------|------|------|
| Supabase URL | ✅ 已提供 | 数据库地址 |
| Supabase Anon Key | ✅ 已提供 | 匿名访问密钥 |
| PostgreSQL 连接 | ✅ 已提供 | 数据库直连（用于迁移） |
| 项目域名 | ✅ 已提供 | 本地开发可不配置 |

## 需要自行获取的配置

以下配置需要你自行在对应平台获取：

### 1. 腾讯云 COS（文件存储）

**获取步骤**：
1. 访问 [腾讯云控制台](https://console.cloud.tencent.com)
2. 开通对象存储 COS 服务
3. 创建存储桶（Bucket）
4. 在「访问管理」→「API密钥」获取 SecretId 和 SecretKey

**配置项**：
```env
COZE_COS_SECRET_ID=你的SecretId
COZE_COS_SECRET_KEY=你的SecretKey
COZE_COS_BUCKET=存储桶名称（如：my-files-1234567890）
COZE_COS_REGION=地域（如：ap-guangzhou）
```

**地域列表**：
- `ap-beijing` - 北京
- `ap-shanghai` - 上海
- `ap-guangzhou` - 广州
- `ap-chengdu` - 成都
- `ap-nanjing` - 南京

### 2. LLM API（AI 智能分类）

**支持的服务商**：

#### 豆包（火山引擎）
1. 访问 [火山引擎控制台](https://console.volcengine.com/ark)
2. 开通豆包大模型服务
3. 创建推理接入点，获取 API Key

```env
LLM_API_KEY=你的API密钥
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
LLM_MODEL=doubao-pro-32k
```

#### DeepSeek
```env
LLM_API_KEY=你的API密钥
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

#### Kimi（月之暗面）
```env
LLM_API_KEY=你的API密钥
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=moonshot-v1-8k
```

## 快速配置

### 最小配置（仅数据库）

如果暂时不需要文件上传和AI分类功能，只需配置 Supabase：

```bash
# 复制配置文件
cp .env.local.backup .env.local

# 启动项目
pnpm install
pnpm dev
```

### 完整配置

```bash
# 1. 复制配置文件
cp .env.local.backup .env.local

# 2. 编辑 .env.local，填入 COS 和 LLM 配置

# 3. 安装依赖
pnpm install

# 4. 启动项目
pnpm dev
```

## 注意事项

1. **Supabase 配置有效期**：当前提供的 Supabase 配置是云托管的，可能在项目停止后失效
2. **安全建议**：生产环境请使用自己的 Supabase 项目和 COS 存储桶
3. **费用说明**：
   - Supabase 有免费额度
   - 腾讯云 COS 按量计费
   - LLM API 按调用次数计费

## 如何创建自己的 Supabase 项目

1. 访问 [Supabase 官网](https://supabase.com)
2. 注册并创建新项目
3. 在项目设置中获取 URL 和 Anon Key
4. 运行 `supabase/migrations/` 下的 SQL 脚本初始化数据库
