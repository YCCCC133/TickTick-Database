-- 实名认证字段迁移
-- 执行方式: 在 Supabase Dashboard 的 SQL Editor 中执行

-- 给 profiles 表添加实名认证字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS real_name VARCHAR(50);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS student_id VARCHAR(30);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- 添加唯一约束
ALTER TABLE profiles ADD CONSTRAINT unique_student_id UNIQUE (student_id);
ALTER TABLE profiles ADD CONSTRAINT unique_phone UNIQUE (phone);

-- 添加非空约束（注册时必须填写）
ALTER TABLE profiles ALTER COLUMN real_name SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN student_id SET NOT NULL;

-- 添加注释
COMMENT ON COLUMN profiles.real_name IS '真实姓名';
COMMENT ON COLUMN profiles.student_id IS '学号';
COMMENT ON COLUMN profiles.phone IS '手机号';
COMMENT ON COLUMN profiles.school IS '学校';
COMMENT ON COLUMN profiles.is_verified IS '是否已实名认证';
