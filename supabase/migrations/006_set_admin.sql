-- 设置管理员账号
-- 执行方式: 在 Supabase Dashboard 的 SQL Editor 中执行

-- 将 liaoyuchun7@gmail.com 设置为管理员
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'liaoyuchun7@gmail.com';

-- 如果上面的语句没有更新任何行，说明该用户还没有注册
-- 需要先注册账号，然后再执行上面的 SQL

-- 查看所有用户和角色
SELECT email, name, real_name, student_id, role, is_verified 
FROM profiles 
ORDER BY created_at DESC;

-- 查看特定用户
SELECT email, name, role FROM profiles WHERE email = 'liaoyuchun7@gmail.com';
