-- 添加审核相关字段到 files 表
-- 执行方式: 在 Supabase Dashboard 的 SQL Editor 中执行

-- 1. 添加审核状态相关字段
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE files ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE files ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);
ALTER TABLE files ADD COLUMN IF NOT EXISTS ai_classified_at TIMESTAMP WITH TIME ZONE;

-- 2. 添加索引
CREATE INDEX IF NOT EXISTS idx_files_is_active ON files(is_active);
CREATE INDEX IF NOT EXISTS idx_files_reviewed_at ON files(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_files_ai_classified_at ON files(ai_classified_at);

-- 3. 添加注释
COMMENT ON COLUMN files.is_active IS '是否已上架（审核通过）';
COMMENT ON COLUMN files.reviewed_at IS '人工审核时间';
COMMENT ON COLUMN files.reviewed_by IS '审核人ID';
COMMENT ON COLUMN files.ai_classified_at IS 'AI分类审核时间';

-- 4. 更新现有数据：所有现有文件默认已审核
UPDATE files 
SET 
  is_active = true,
  reviewed_at = COALESCE(reviewed_at, created_at)
WHERE is_active IS NULL OR is_active = true;

-- 5. 创建复合索引优化待审核查询
CREATE INDEX IF NOT EXISTS idx_files_pending_review ON files(is_active, reviewed_at) WHERE is_active = false;
CREATE INDEX IF NOT EXISTS idx_files_pending_ai_review ON files(ai_classified_at) WHERE ai_classified_at IS NULL;
