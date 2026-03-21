import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { deleteFile } from "@/lib/storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      );
    }

    const client = getSupabaseClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "无效的令牌" },
        { status: 401 }
      );
    }

    // 获取用户资料检查权限
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "volunteer")) {
      return NextResponse.json(
        { error: "权限不足" },
        { status: 403 }
      );
    }

    // 获取文件信息
    const { data: file, error: fileError } = await client
      .from("files")
      .select("*")
      .eq("id", id)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: "文件不存在" },
        { status: 404 }
      );
    }

    // 删除对象存储中的文件
    await deleteFile(file.file_key);

    // 软删除数据库记录
    const { error } = await client
      .from("files")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "文件已删除",
    });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json(
      { error: "删除失败" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data: file, error } = await client
      .from("files")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !file) {
      return NextResponse.json(
        { error: "文件不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({ file });
  } catch (error) {
    console.error("Get file error:", error);
    return NextResponse.json(
      { error: "获取文件信息失败" },
      { status: 500 }
    );
  }
}
