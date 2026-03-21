import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 初始化默认分类
export async function POST() {
  try {
    const client = getSupabaseClient();
    
    const defaultCategories = [
      {
        name: "期末试卷",
        slug: "exams",
        description: "历年期末考试真题",
        icon: "file-text",
        color: "#3B82F6",
        order: 1,
      },
      {
        name: "复习笔记",
        slug: "notes",
        description: "课程复习笔记和总结",
        icon: "book",
        color: "#10B981",
        order: 2,
      },
      {
        name: "课件资料",
        slug: "slides",
        description: "PPT课件和讲义",
        icon: "presentation",
        color: "#F59E0B",
        order: 3,
      },
      {
        name: "作业答案",
        slug: "homework",
        description: "作业习题和答案",
        icon: "check-circle",
        color: "#8B5CF6",
        order: 4,
      },
      {
        name: "学习资料",
        slug: "materials",
        description: "其他学习辅助材料",
        icon: "folder",
        color: "#EC4899",
        order: 5,
      },
    ];

    const { data, error } = await client
      .from("categories")
      .insert(defaultCategories)
      .select();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "初始化完成",
      categories: data,
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { error: "初始化失败" },
      { status: 500 }
    );
  }
}
