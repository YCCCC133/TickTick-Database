-- 评论和评分表迁移
-- 执行方式: 在 Supabase Dashboard 的 SQL Editor 中执行

-- 1. 创建评分表
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(file_id, user_id) -- 每个用户对每个文件只能评分一次
);

-- 2. 创建评论表
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_ratings_file_id ON ratings(file_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_file_id ON comments(file_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);

-- 4. 启用 RLS
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 5. ratings 表 RLS 策略
-- 所有人可以查看评分
CREATE POLICY "所有人可以查看评分" ON ratings
  FOR SELECT USING (true);

-- 登录用户可以添加评分
CREATE POLICY "登录用户可以添加评分" ON ratings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 用户可以更新自己的评分
CREATE POLICY "用户可以更新自己的评分" ON ratings
  FOR UPDATE USING (auth.uid()::text = user_id);

-- 6. comments 表 RLS 策略
-- 所有人可以查看活跃评论
CREATE POLICY "所有人可以查看活跃评论" ON comments
  FOR SELECT USING (is_active = true);

-- 登录用户可以添加评论
CREATE POLICY "登录用户可以添加评论" ON comments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 用户可以更新自己的评论
CREATE POLICY "用户可以更新自己的评论" ON comments
  FOR UPDATE USING (auth.uid()::text = user_id);

-- 管理员可以删除评论
CREATE POLICY "管理员可以删除评论" ON comments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'volunteer'))
  );

-- 7. 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_ratings_updated_at ON ratings;
CREATE TRIGGER update_ratings_updated_at
  BEFORE UPDATE ON ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 8. 添加注释
COMMENT ON TABLE ratings IS '文件评分表';
COMMENT ON TABLE comments IS '文件评论表';
COMMENT ON COLUMN ratings.score IS '评分 1-5 分';
COMMENT ON COLUMN comments.parent_id IS '回复的评论ID，为空表示一级评论';
