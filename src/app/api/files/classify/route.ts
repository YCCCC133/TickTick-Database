import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { invokeKimiChat } from "@/lib/kimi-client";

// 关键词到分类的映射（关键词 -> 可能的分类名称）
const KEYWORD_TO_CATEGORIES: Array<{
  keywords: string[];
  possibleCategories: string[];
}> = [
  // 数学相关
  {
    keywords: ["高数", "高等数学", "微积分", "极限", "导数", "积分", "微分", "数学分析"],
    possibleCategories: ["高数", "数学", "复习笔记"],
  },
  {
    keywords: ["线性代数", "矩阵", "行列式"],
    possibleCategories: ["线性代数", "高数", "数学"],
  },
  // 物理相关
  {
    keywords: ["物理", "大物", "力学", "电磁", "光学", "热学", "大学物理"],
    possibleCategories: ["大物", "物理", "实验报告"],
  },
  // 英语相关
  {
    keywords: ["英语", "四六级", "CET", "雅思", "托福", "GRE", "英语单词"],
    possibleCategories: ["英语", "四六级"],
  },
  // 计算机相关
  {
    keywords: ["计算机", "编程", "代码", "算法", "数据结构", "操作系统", "数据库", "Java", "Python", "C++", "前端", "后端", "软件工程", "人工智能", "机器学习", "深度学习", "408"],
    possibleCategories: ["计算机", "编程", "学习资料"],
  },
  // 政治相关
  {
    keywords: ["政治", "马原", "毛概", "思修", "近代史", "考研政治"],
    possibleCategories: ["政治", "考研"],
  },
  // 考试相关
  {
    keywords: ["期末", "试卷", "真题", "考试", "题库"],
    possibleCategories: ["期末试卷", "试卷", "真题"],
  },
  // 复习相关
  {
    keywords: ["复习", "笔记", "总结", "重点"],
    possibleCategories: ["复习笔记", "笔记", "学习资料"],
  },
  // 考研相关
  {
    keywords: ["考研", "研究生", "复试", "初试"],
    possibleCategories: ["考研", "考研资料"],
  },
  // 专业课
  {
    keywords: ["电路", "信号", "通信", "电子", "机械", "材料", "化工"],
    possibleCategories: ["专业课", "学习资料"],
  },
];

// 根据文件名匹配分类
function matchByKeywords(fileName: string, availableCategories: string[]): string | null {
  const lowerName = fileName.toLowerCase();
  
  // 使用新的映射规则
  for (const rule of KEYWORD_TO_CATEGORIES) {
    for (const keyword of rule.keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        // 找到关键词后，尝试匹配可用的分类
        for (const possibleCat of rule.possibleCategories) {
          if (availableCategories.includes(possibleCat)) {
            return possibleCat;
          }
        }
      }
    }
  }
  return null;
}

// 使用 LLM 进行智能分类
async function classifyWithLLM(
  fileNames: string[],
  categoryNames: string[]
): Promise<Record<string, string>> {
  const systemPrompt = `你是一个文件分类助手。你需要根据文件名判断文件应该属于哪个分类。

可用的分类列表：
${categoryNames.map((c, i) => `${i + 1}. ${c}`).join("\n")}

分类规则：
1. 根据文件名中的关键词判断学科或类型
2. 如果无法确定，选择"学习资料"
3. 只返回 JSON 格式结果，不要有其他内容

返回格式示例：
{"文件名1.pdf": "分类名", "文件名2.doc": "分类名"}`;

  const userPrompt = `请对以下文件进行分类：
${fileNames.map((f, i) => `${i + 1}. ${f}`).join("\n")}

请直接返回 JSON 格式的分类结果。`;

  try {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const response = await invokeKimiChat(messages, {
      temperature: 0.3, // 低温度，更确定性的输出
    });

    // 解析 JSON 响应
    const content = response.content.trim();
    // 尝试提取 JSON 部分
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (error) {
    console.error("LLM classification error:", error);
    return {};
  }
}

// AI智能分类
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileNames } = body;

    if (!fileNames || !Array.isArray(fileNames)) {
      return NextResponse.json({ error: "无效的文件名列表" }, { status: 400 });
    }

    // 获取数据库中的分类列表
    const client = getSupabaseClient();
    const { data: categories } = await client
      .from("categories")
      .select("id, name");

    const categoryNames = categories?.map((c: { id: string; name: string }) => c.name) || [];
    const categoryMap_byName: Record<string, string> = {};
    categories?.forEach((cat: { id: string; name: string }) => {
      categoryMap_byName[cat.name] = cat.id;
    });

    // 先尝试关键词匹配
    const keywordResults: Record<string, string> = {};
    const needLLMClassify: string[] = [];

    for (const fileName of fileNames) {
      // 1. 先尝试关键词匹配（传入可用分类列表）
      const keywordMatch = matchByKeywords(fileName, categoryNames);
      if (keywordMatch) {
        keywordResults[fileName] = keywordMatch;
        continue;
      }

      // 2. 尝试直接匹配数据库中的分类名称
      let matched = false;
      for (const catName of categoryNames) {
        if (fileName.toLowerCase().includes(catName.toLowerCase())) {
          keywordResults[fileName] = catName;
          matched = true;
          break;
        }
      }

      if (!matched) {
        needLLMClassify.push(fileName);
      }
    }

    // 对关键词匹配不到的文件使用 LLM 分类
    let llmResults: Record<string, string> = {};
    if (needLLMClassify.length > 0) {
      console.log(`使用 LLM 对 ${needLLMClassify.length} 个文件进行分类...`);
      llmResults = await classifyWithLLM(needLLMClassify, categoryNames);
    }

    // 合并结果
    const results = fileNames.map((fileName: string) => {
      let category = keywordResults[fileName] || llmResults[fileName];
      let method = "default";

      if (keywordResults[fileName]) {
        method = "keyword";
      } else if (llmResults[fileName]) {
        method = "ai";
      }

      // 验证分类是否存在
      if (!category || !categoryNames.includes(category)) {
        category = categoryNames[0] || "学习资料";
        method = "default";
      }

      return { fileName, category, method };
    });

    return NextResponse.json({ 
      results,
      stats: {
        total: fileNames.length,
        keywordMatched: Object.keys(keywordResults).length,
        aiClassified: Object.keys(llmResults).length,
      }
    });
  } catch (error) {
    console.error("Classify error:", error);
    return NextResponse.json({ error: "分类失败" }, { status: 500 });
  }
}
