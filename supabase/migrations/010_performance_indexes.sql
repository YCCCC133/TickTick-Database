-- 性能优化索引：面向大规模资料量、搜索和高并发访问
-- 说明：可直接在 Supabase SQL Editor 执行，或纳入迁移流程

-- 1. 启用 trigram 扩展，支持 ILIKE / 模糊搜索 / 归一化文本搜索
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. 文件列表高频筛选 / 排序索引
CREATE INDEX IF NOT EXISTS idx_files_active_created_at ON files (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_active_featured_created_at ON files (is_active, is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_active_download_count ON files (is_active, download_count DESC);
CREATE INDEX IF NOT EXISTS idx_files_active_average_rating ON files (is_active, average_rating DESC);
CREATE INDEX IF NOT EXISTS idx_files_active_reviewed_at ON files (is_active, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_active_ai_classified_at ON files (is_active, ai_classified_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_category_created_at ON files (category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_uploader_created_at ON files (uploader_id, created_at DESC);

-- 3. 面向首页/后台搜索的文本模糊索引（与前端归一化搜索保持一致）
CREATE INDEX IF NOT EXISTS idx_files_title_norm_trgm ON files USING gin ((regexp_replace(lower(coalesce(title, '')), '[^0-9a-zA-Z一-龥]+', '', 'g')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_files_file_name_norm_trgm ON files USING gin ((regexp_replace(lower(coalesce(file_name, '')), '[^0-9a-zA-Z一-龥]+', '', 'g')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_files_course_norm_trgm ON files USING gin ((regexp_replace(lower(coalesce(course, '')), '[^0-9a-zA-Z一-龥]+', '', 'g')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_files_description_norm_trgm ON files USING gin ((regexp_replace(lower(coalesce(description, '')), '[^0-9a-zA-Z一-龥]+', '', 'g')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_categories_name_norm_trgm ON categories USING gin ((regexp_replace(lower(coalesce(name, '')), '[^0-9a-zA-Z一-龥]+', '', 'g')) gin_trgm_ops);

-- 4. 评论聚合加速
CREATE INDEX IF NOT EXISTS idx_comments_active_file_id ON comments (file_id) WHERE is_active = true;

-- 5. 额外的管理员查询加速
CREATE INDEX IF NOT EXISTS idx_files_pending_review ON files (is_active, reviewed_at) WHERE is_active = false;
CREATE INDEX IF NOT EXISTS idx_files_pending_ai_review ON files (ai_classified_at) WHERE ai_classified_at IS NULL;
