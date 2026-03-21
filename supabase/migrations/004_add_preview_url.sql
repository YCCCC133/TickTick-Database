-- 添加预览图字段迁移
-- 执行方式: 在 Supabase Dashboard 的 SQL Editor 中执行

-- 给 files 表添加预览图字段
ALTER TABLE files ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- 添加注释
COMMENT ON COLUMN files.preview_url IS '文件预览图URL';
