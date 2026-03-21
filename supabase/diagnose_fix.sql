-- 诊断和修复脚本
-- 在 Supabase Dashboard > SQL Editor 中执行

-- 1. 首先查看所有用户（不受 RLS 限制，用 service_role 执行）
SELECT 
  user_id,
  email, 
  name,
  real_name,
  student_id,
  role,
  is_verified,
  created_at
FROM profiles 
ORDER BY created_at DESC;

-- 2. 如果上面的查询结果中 liaoyuchun7@gmail.com 的 role 不是 admin，执行下面这句：
UPDATE profiles 
SET role = 'admin', is_verified = true 
WHERE email = 'liaoyuchun7@gmail.com';

-- 3. 再次查看确认
SELECT email, name, role FROM profiles WHERE email = 'liaoyuchun7@gmail.com';

-- 4. 如果查询结果为空，说明 profiles 表中没有这个用户
-- 需要手动插入：
INSERT INTO profiles (user_id, email, name, role, is_verified)
SELECT 
  id as user_id,
  email,
  email->>'email' as name,
  'admin' as role,
  true as is_verified
FROM auth.users 
WHERE email = 'liaoyuchun7@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', is_verified = true;
