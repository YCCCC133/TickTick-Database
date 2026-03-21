import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { cache } from "@/lib/cache";
import { rewardPublishPoints } from "@/lib/points";

// 审核文件（通过或拒绝）
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "无效的令牌" }, { status: 401 });
    }

    // 检查管理员权限并获取审核人ID
    const { data: profile } = await client
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限访问" }, { status: 403 });
    }

    const body = await request.json();
    const { fileId, approved, reason } = body;

    if (!fileId) {
      return NextResponse.json({ error: "缺少文件ID" }, { status: 400 });
    }

    // 查询文件信息
    const { data: fileData, error: fileError } = await client
      .from("files")
      .select("id, title, uploader_id, is_active")
      .eq("id", fileId)
      .single();

    if (fileError || !fileData) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    if (approved) {
      // 审核通过：设置is_active为true，记录审核时间和审核人
      // 注意：reviewed_by 引用的是 auth.users.id，所以用 user.id 而不是 profile.id
      const { error: updateError } = await client
        .from("files")
        .update({ 
          is_active: true,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", fileId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      if (!fileData.is_active) {
        await rewardPublishPoints(fileData.uploader_id, fileId);
      }

      // 清除首页缓存，确保新审核的文件立即显示
      cache.delete("files:home");
      console.log(`[Approve] 文件审核通过，已清除首页缓存: ${fileId}`);

      return NextResponse.json({ 
        message: "审核通过，资料已上架",
        fileId 
      });
    } else {
      if (fileData.is_active) {
        return NextResponse.json({ error: "已审核文件不能拒绝删除" }, { status: 400 });
      }

      // 审核拒绝：删除文件
      const { error: deleteError } = await client
        .from("files")
        .delete()
        .eq("id", fileId);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      // 可选：通知上传者（这里可以扩展通知系统）
      // TODO: 发送拒绝通知给上传者

      return NextResponse.json({ 
        message: "已拒绝该资料",
        fileId,
        reason 
      });
    }
  } catch (error) {
    console.error("Approve file error:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 批量审核文件
export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    
    if (!token) {
      console.error("[Batch Approve] No token provided");
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      console.error("[Batch Approve] Auth error:", authError);
      return NextResponse.json({ error: "无效的令牌" }, { status: 401 });
    }

    // 检查管理员权限并获取审核人ID
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    console.log("[Batch Approve] Profile:", profile, "Error:", profileError);

    if (profileError) {
      console.error("[Batch Approve] Profile fetch error:", profileError);
      return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
    }

    if (!profile) {
      console.error("[Batch Approve] Profile not found for user:", user.id);
      return NextResponse.json({ error: "用户信息不存在" }, { status: 404 });
    }

    if (profile.role !== "admin" && profile.role !== "volunteer") {
      console.error("[Batch Approve] Permission denied, role:", profile.role);
      return NextResponse.json({ error: "无权限访问" }, { status: 403 });
    }

    const body = await request.json();
    const { fileIds, approved } = body;

    console.log("[Batch Approve] Request body:", { fileIds, approved });

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: "请提供需要审核的文件ID列表" }, { status: 400 });
    }

    if (approved) {
      // 批量审核通过
      // 注意：reviewed_by 引用的是 auth.users.id，所以用 user.id 而不是 profile.id
      const { data: fileStates, error: stateError } = await client
        .from("files")
        .select("id, uploader_id, is_active")
        .in("id", fileIds);

      if (stateError) {
        console.error("[Batch Approve] State fetch error:", stateError);
        return NextResponse.json({ error: stateError.message }, { status: 500 });
      }

      const publishableFiles = (fileStates || []).filter((file: { id: string; uploader_id: string; is_active: boolean }) => !file.is_active);

      const updateData = { 
        is_active: true,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      };
      
      console.log("[Batch Approve] Update data:", updateData);
      
      const { error: updateError } = await client
        .from("files")
        .update(updateData)
        .in("id", fileIds);

      if (updateError) {
        console.error("[Batch Approve] Update error:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      await Promise.all(
        publishableFiles.map((file: { id: string; uploader_id: string; is_active: boolean }) => rewardPublishPoints(file.uploader_id, file.id))
      );

      cache.delete("files:home");
      console.log(`[Batch Approve] 已清除首页缓存，文件已上架: ${fileIds.length} 个`);

      console.log("[Batch Approve] Success, count:", fileIds.length);
      return NextResponse.json({ 
        message: `已批量审核通过 ${fileIds.length} 个文件`,
        count: fileIds.length
      });
    } else {
      const { data: fileStates, error: stateError } = await client
        .from("files")
        .select("id, is_active")
        .in("id", fileIds);

      if (stateError) {
        console.error("[Batch Approve] State fetch error:", stateError);
        return NextResponse.json({ error: stateError.message }, { status: 500 });
      }

      const activeFileIds = (fileStates || [])
        .filter((file: { id: string; uploader_id: string; is_active: boolean }) => file.is_active)
        .map((file: { id: string; uploader_id: string; is_active: boolean }) => file.id);

      if (activeFileIds.length > 0) {
        return NextResponse.json({
          error: `已审核文件不能拒绝删除: ${activeFileIds.join(", ")}`,
          activeFileIds,
        }, { status: 400 });
      }

      // 批量拒绝：删除文件
      const { error: deleteError } = await client
        .from("files")
        .delete()
        .in("id", fileIds);

      if (deleteError) {
        console.error("[Batch Approve] Delete error:", deleteError);
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      return NextResponse.json({ 
        message: `已批量拒绝 ${fileIds.length} 个文件`,
        count: fileIds.length
      });
    }
  } catch (error) {
    console.error("Batch approve error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error("[Batch Approve] Error details:", { message: errorMessage, stack: errorStack });
    return NextResponse.json({ error: `服务器错误: ${errorMessage}` }, { status: 500 });
  }
}
