-- 积分系统数据库迁移
-- 执行方式: 在 Supabase Dashboard 的 SQL Editor 中执行

-- 1. 用户积分表
CREATE TABLE IF NOT EXISTS user_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2. 积分记录表
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'upload', 'download', 'weekly_top', 'featured', 'admin_adjust', 'register_bonus'
  description TEXT,
  related_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 精选文件表
CREATE TABLE IF NOT EXISTS featured_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  featured_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(file_id)
);

-- 4. 给 files 表添加精选标记
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON user_points(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_type ON point_transactions(type);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON point_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_featured_files_file_id ON featured_files(file_id);
CREATE INDEX IF NOT EXISTS idx_files_download_count ON files(download_count);

-- 6. 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_points_updated_at ON user_points;
CREATE TRIGGER update_user_points_updated_at
  BEFORE UPDATE ON user_points
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. 设置 RLS 策略
ALTER TABLE user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE featured_files ENABLE ROW LEVEL SECURITY;

-- user_points 策略
CREATE POLICY "用户可以查看自己的积分" ON user_points
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "管理员可以查看所有积分" ON user_points
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'volunteer'))
  );

-- point_transactions 策略
CREATE POLICY "用户可以查看自己的积分记录" ON point_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "管理员可以查看所有积分记录" ON point_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'volunteer'))
  );

-- featured_files 策略
CREATE POLICY "所有人可以查看精选文件" ON featured_files
  FOR SELECT USING (true);

CREATE POLICY "管理员可以添加精选" ON featured_files
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'volunteer'))
  );

CREATE POLICY "管理员可以删除精选" ON featured_files
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'volunteer'))
  );

-- 8. 积分配置
-- 上传文件: +10 积分
-- 下载文件: -5 积分
-- 周下载排名前5: +50 积分
-- 被精选: +30 积分
-- 注册奖励: +20 积分

COMMENT ON TABLE user_points IS '用户积分余额表';
COMMENT ON TABLE point_transactions IS '积分流水记录表';
COMMENT ON TABLE featured_files IS '精选文件表';
