-- 完整的 profiles 表结构（修复版）
-- 执行方式: 在 Supabase Dashboard 的 SQL Editor 中执行

-- 1. 确保 profiles 表存在并包含所有必要字段
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  real_name TEXT,
  student_id TEXT UNIQUE,
  phone TEXT UNIQUE,
  school TEXT,
  avatar TEXT,
  role VARCHAR(20) DEFAULT 'guest' CHECK (role IN ('admin', 'volunteer', 'guest')),
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 添加缺失的列（如果表已存在）
DO $$ 
BEGIN
  -- 添加 real_name 列
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'real_name') THEN
    ALTER TABLE profiles ADD COLUMN real_name TEXT;
  END IF;
  
  -- 添加 student_id 列
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'student_id') THEN
    ALTER TABLE profiles ADD COLUMN student_id TEXT UNIQUE;
  END IF;
  
  -- 添加 phone 列
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'phone') THEN
    ALTER TABLE profiles ADD COLUMN phone TEXT UNIQUE;
  END IF;
  
  -- 添加 school 列
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'school') THEN
    ALTER TABLE profiles ADD COLUMN school TEXT;
  END IF;
  
  -- 添加 is_verified 列
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_verified') THEN
    ALTER TABLE profiles ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- 添加 role 列（如果不存在）
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles ADD COLUMN role VARCHAR(20) DEFAULT 'guest' CHECK (role IN ('admin', 'volunteer', 'guest'));
  END IF;
END $$;

-- 3. 确保 role 字段有默认值
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'guest';

-- 4. 更新现有用户的 role 为 guest（如果为空）
UPDATE profiles SET role = 'guest' WHERE role IS NULL;

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 6. 设置 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略（如果有）
DROP POLICY IF EXISTS "用户可以查看自己的资料" ON profiles;
DROP POLICY IF EXISTS "用户可以更新自己的资料" ON profiles;
DROP POLICY IF EXISTS "管理员可以查看所有资料" ON profiles;
DROP POLICY IF EXISTS "管理员可以更新所有资料" ON profiles;

-- 创建新策略
CREATE POLICY "用户可以查看自己的资料" ON profiles
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "用户可以更新自己的资料" ON profiles
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "管理员可以查看所有资料" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid()::text AND p.role = 'admin')
  );

CREATE POLICY "管理员可以更新所有资料" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid()::text AND p.role = 'admin')
  );

CREATE POLICY "注册时可以插入资料" ON profiles
  FOR INSERT WITH CHECK (true);

-- 7. 设置管理员账号
-- 注意：需要先注册账号，然后执行此语句
UPDATE profiles 
SET role = 'admin', is_verified = true 
WHERE email = 'liaoyuchun7@gmail.com';

-- 8. 查看结果
SELECT email, name, real_name, student_id, role, is_verified 
FROM profiles 
ORDER BY created_at DESC;
