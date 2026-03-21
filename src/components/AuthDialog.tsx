"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Mail, Lock, User } from "lucide-react";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "login" | "register";
  onModeChange: (mode: "login" | "register") => void;
}

export default function AuthDialog({
  open,
  onOpenChange,
  mode,
  onModeChange,
}: AuthDialogProps) {
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const result = await login(email, password);
        toast.success("登录成功");
        onOpenChange(false);
        resetForm();
        // 管理员或志愿者登录后自动跳转到管理后台
        if (result.isAdmin || result.isVolunteer) {
          router.push("/admin");
        }
      } else {
        await register(email, password, name);
        toast.success("注册成功，请登录");
        onModeChange("login");
      }
    } catch (error: any) {
      toast.error(error.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: "login" | "register") => {
    onModeChange(newMode);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px] bg-white border-[#E2E8F0] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-[#1E293B]">
            {mode === "login" ? "登录" : "注册账号"}
          </DialogTitle>
          <DialogDescription className="text-[#64748B]">
            {mode === "login" ? "登录以管理资料" : "匿名注册，保护隐私"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {mode === "register" && (
            <div>
              <Label className="text-sm text-[#475569]">昵称 *</Label>
              <div className="relative mt-1.5">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="你的昵称（可匿名）"
                  className="neu-input pl-10"
                  required
                />
              </div>
            </div>
          )}

          {/* 邮箱 */}
          <div>
            <Label className="text-sm text-[#475569]">邮箱 *</Label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="neu-input pl-10"
                required
              />
            </div>
          </div>

          {/* 密码 */}
          <div>
            <Label className="text-sm text-[#475569]">密码 *</Label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少6位密码"
                className="neu-input pl-10"
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full neu-button-primary py-3 disabled:opacity-50"
          >
            {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
          </button>

          <div className="text-center text-sm text-[#64748B]">
            {mode === "login" ? (
              <>
                还没有账号？{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="text-[#005BA3] font-medium hover:underline"
                >
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账号？{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-[#005BA3] font-medium hover:underline"
                >
                  立即登录
                </button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
