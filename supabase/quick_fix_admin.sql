-- 一键修复脚本：设置管理员并显示当前用户信息
-- 在 Supabase Dashboard 的 SQL Editor 中执行

-- 1. 首先查看所有注册用户
SELECT 
  id,
  user_id,
  email, 
  name, 
  role,
  is_verified,
  created_at
FROM profiles 
ORDER BY created_at DESC;

-- 2. 设置管理员（将 email 改为你的邮箱）
UPDATE profiles 
SET role = 'admin', is_verified = true 
WHERE email = 'liaoyuchun7@gmail.com';

-- 3. 如果上面的 UPDATE 没有效果（返回 0 rows），说明用户还没注册
-- 请先注册账号，然后再执行上面的 SQL

-- 4. 验证设置是否成功
SELECT email, name, role FROM profiles WHERE email = 'liaoyuchun7@gmail.com';
