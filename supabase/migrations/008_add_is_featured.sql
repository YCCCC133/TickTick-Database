-- 添加 is_featured 字段到 files 表
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- 添加索引
CREATE INDEX IF NOT EXISTS files_is_featured_idx ON files(is_featured);

-- 添加注释
COMMENT ON COLUMN files.is_featured IS '是否为精选资料';
