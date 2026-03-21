import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { cache } from "@/lib/cache";
import { extractFileContent } from "@/lib/file-content-extractor";
import { invokeKimiChat } from "@/lib/kimi-client";
import { rewardPublishPoints } from "@/lib/points";

// 每批处理的文件数量
const BATCH_SIZE = 12;

// 获取分类列表（带缓存）
let categoryCache: { map: Record<string, string>; names: string[]; time: number } | null = null;

async function getCategories(client: ReturnType<typeof getSupabaseClient>) {
  const now = Date.now();
  if (categoryCache && now - categoryCache.time < 60000) { // 1分钟缓存
    return categoryCache;
  }
  
  const { data: categories } = await client
    .from("categories")
    .select("id, name");
  
  const map: Record<string, string> = {};
  const names: string[] = [];
  categories?.forEach(cat => {
    map[cat.name] = cat.id;
    map[cat.id] = cat.name;
    names.push(cat.name);
  });
  
  categoryCache = { map, names, time: now };
  return categoryCache;
}

const REVIEW_LLM_BATCH_SIZE = 6;
const CONTENT_EXTRACTION_CONCURRENCY = 2;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await mapper(items[current]);
    }
  });

  await Promise.all(workers);
  return results;
}

type ReviewInputFile = {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileKey?: string | null;
  categoryId?: string | null;
  currentCategory: string;
  course?: string | null;
  description?: string | null;
};

type ReviewResult = {
  id: string;
  compliant: boolean;
  complianceIssue: string | null;
  categoryCorrect: boolean;
  suggestedCategory: string | null;
  suggestedCategoryId: string | null;
  optimizedTitle: string;
  titleChanged: boolean;
  reason?: string | null;
};

type BatchOutcome = {
  results: ReviewResult[];
  failedIds: string[];
  error?: string;
};

type ReviewInputRecord = Record<string, unknown>;
type LlmReviewItem = {
  id: string | number;
  compliant?: boolean;
  complianceIssue?: string | null;
  categoryCorrect?: boolean;
  suggestedCategory?: string | null;
  attribution?: string | null;
  year?: string | number | null;
  contentTitle?: string | null;
  optimizedTitle?: string | null;
  titleChanged?: boolean;
  reason?: string | null;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeFile(input: ReviewInputRecord, categories: Awaited<ReturnType<typeof getCategories>>): ReviewInputFile {
  const fileName = asString(input.fileName ?? input.file_name);
  const fileType = asString(input.fileType ?? input.file_type).toLowerCase();
  const fileKey = (input.fileKey ?? input.file_key) as string | null | undefined;
  const categoryId = (input.categoryId ?? input.category_id) as string | null | undefined;
  const currentCategory = asString(input.currentCategory, categories.map[categoryId || ""] || "未分类");

  return {
    id: asString(input.id),
    title: asString(input.title, fileName || "未命名文件"),
    fileName: fileName || asString(input.title, "未命名文件"),
    fileType,
    fileKey: fileKey || null,
    categoryId: categoryId || null,
    currentCategory,
    course: (input.course as string | null | undefined) || null,
    description: (input.description as string | null | undefined) || null,
  };
}

function shouldExtractText(file: ReviewInputFile): boolean {
  return Boolean(file.fileKey && (file.fileType === "pdf" || file.fileName.toLowerCase().endsWith(".pdf")));
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

function extractJsonObject(content: string): string | null {
  const cleaned = stripCodeFence(content);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return cleaned.slice(firstBrace, lastBrace + 1);
}

function normalizeTitleSegment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[【】\[\]<>《》]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[|｜]+/g, " ")
    .replace(/^[\s\-–—_:.·•]+|[\s\-–—_:.·•]+$/g, "")
    .trim();
  return normalized || null;
}

function normalizeYear(value: unknown): string | null {
  const text = normalizeTitleSegment(value);
  if (!text) return null;
  const match = text.match(/(?:19|20)\d{2}/);
  return match ? match[0] : null;
}

function stripYearFromText(text: string): string {
  return text
    .replace(/(?:19|20)\d{2}年?/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTitlePartsFromText(text: string): { attribution: string | null; year: string | null; contentTitle: string | null } {
  const normalized = normalizeTitleSegment(text);
  if (!normalized) {
    return { attribution: null, year: null, contentTitle: null };
  }

  const year = normalizeYear(normalized);
  const noYear = stripYearFromText(normalized);
  const markers = ["真题", "试卷", "考点分类", "题库", "讲义", "笔记", "资料", "答案", "解析", "复习", "汇编", "课件"];
  const marker = markers.find((item) => noYear.includes(item));

  if (marker) {
    const index = noYear.indexOf(marker);
    const attribution = normalizeTitleSegment(noYear.slice(0, index));
    const contentTitle = normalizeTitleSegment(noYear.slice(index));
    return {
      attribution,
      year,
      contentTitle,
    };
  }

  const separators = [" - ", "—", "–", "_", ":", "：", "·", "|", "｜"];
  const separator = separators.find((item) => noYear.includes(item));
  if (separator) {
    const [left, ...rest] = noYear.split(separator);
    const attribution = normalizeTitleSegment(left);
    const contentTitle = normalizeTitleSegment(rest.join(separator));
    return {
      attribution,
      year,
      contentTitle,
    };
  }

  return {
    attribution: null,
    year,
    contentTitle: noYear || null,
  };
}

function composeAdaptiveTitle(parts: {
  attribution?: unknown;
  year?: unknown;
  contentTitle?: unknown;
  preferredTitle?: string;
  fallbackTitle?: string;
  fallbackFileName?: string;
  fallbackText?: string | null;
}) {
  const fallbackCandidates = [
    parts.fallbackTitle,
    parts.fallbackFileName,
    parts.fallbackText || "",
  ].filter(Boolean) as string[];

  const fallbackInference = fallbackCandidates
    .map((value) => inferTitlePartsFromText(value))
    .find((candidate) => candidate.attribution || candidate.year || candidate.contentTitle) || {
      attribution: null,
      year: null,
      contentTitle: null,
    };

  const explicitAttribution = normalizeTitleSegment(parts.attribution);
  const explicitYear = normalizeYear(parts.year);
  const explicitContentTitle = normalizeTitleSegment(parts.contentTitle);
  const preferredTitle = normalizeTitleSegment(parts.preferredTitle);

  const attribution = explicitAttribution || fallbackInference.attribution || normalizeTitleSegment(parts.fallbackTitle) || normalizeTitleSegment(parts.fallbackFileName) || "未命名出品方";
  const year = explicitYear || fallbackInference.year;
  const contentTitle = explicitContentTitle || fallbackInference.contentTitle || normalizeTitleSegment(parts.fallbackTitle) || normalizeTitleSegment(parts.fallbackFileName) || "未命名内容";

  const requiredParts = [attribution, year, contentTitle].filter((item): item is string => Boolean(item));
  const titleCandidates = [
    preferredTitle,
    normalizeTitleSegment(parts.fallbackTitle),
    normalizeTitleSegment(parts.fallbackFileName),
  ].filter((item): item is string => Boolean(item));

  const preferredContainsRequired = (candidate: string | null) => {
    if (!candidate) return false;
    const normalizedCandidate = candidate.replace(/\s+/g, "");
    return requiredParts.every((part) => normalizedCandidate.includes(part.replace(/\s+/g, "")));
  };

  const baseTitle = titleCandidates.find((candidate) => preferredContainsRequired(candidate)) || titleCandidates[0] || contentTitle;

  let optimizedTitle = baseTitle;
  const missingParts: string[] = [];
  if (!preferredContainsRequired(optimizedTitle)) {
    if (!optimizedTitle.includes(attribution)) missingParts.push(attribution);
    if (year && !optimizedTitle.includes(year)) missingParts.push(year);
    if (!optimizedTitle.includes(contentTitle)) missingParts.push(contentTitle);
  }

  if (missingParts.length > 0) {
    optimizedTitle = `${optimizedTitle}（${missingParts.join(" ")}）`;
  }

  optimizedTitle = optimizedTitle.replace(/\s+/g, " ").trim();

  return {
    attribution,
    year,
    contentTitle,
    optimizedTitle,
  };
}

function buildReviewPrompt(
  files: Array<ReviewInputFile & { extractedText?: string | null }>,
  categories: Awaited<ReturnType<typeof getCategories>>
) {
  const payload = files.map((file) => ({
    id: file.id,
    fileName: file.fileName,
    title: file.title,
    currentCategory: file.currentCategory,
    course: file.course,
    description: file.description,
    fileType: file.fileType,
    extractedText: file.extractedText ? file.extractedText.slice(0, 1800) : null,
  }));

  const systemPrompt = `你是一个高精度文件审核模型。你的任务只基于文件元数据和提取文本进行真实判断，不要使用关键词硬匹配规则，不要复述输入，不要编造。

请逐个判断以下维度：
1. 合规性：是否存在色情、赌博、违法、代写、盗版、破解、恶意传播等问题
2. 分类正确性：当前分类是否匹配内容
3. 标题生成：标题需要自然优化，不要求固定顺序，但必须包含可识别的来源标识（品牌名、出品方或作者之一）、年份（若有则保留）和内容标题。来源标识如果原始信息里没有，必须根据内容/文件名推断出来；内容标题如果原始信息里没有，也必须根据内容/文件名推断出来。不要输出空字段。

可用分类：${categories.names.join("、")}

输出必须是严格 JSON，不要输出解释文字，不要使用 markdown 代码块。
JSON 结构：
{
  "results": [
    {
      "id": "文件ID",
      "compliant": true,
      "complianceIssue": null,
      "categoryCorrect": true,
      "suggestedCategory": null,
      "attribution": "品牌名/出品方/作者",
      "year": "2024",
      "contentTitle": "内容标题",
      "optimizedTitle": "优化后的标题",
      "titleChanged": false,
      "reason": "简短原因"
    }
  ]
}

要求：
- 如果内容不合规，compliant 必须为 false，并给出明确原因
- 如果当前分类不准确，suggestedCategory 必须是分类列表中的一个
- 标题生成不要求固定顺序，但必须自然包含来源标识、年份（若有）和内容标题
- attribution 和 contentTitle 至少要有语义，不能留空
- optimizedTitle 必须是可直接展示的自然标题，必要时可用括号补齐缺失信息
- 如果信息不足，结合文件名、标题、摘要保守判断`;

  const userPrompt = `请审核以下文件：${JSON.stringify(payload)}`;

  return [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];
}

async function invokeReviewBatch(
  batch: Array<ReviewInputFile & { extractedText?: string | null }>,
  categories: Awaited<ReturnType<typeof getCategories>>,
  retryLevel = 0
): Promise<ReviewResult[]> {
  const messages = buildReviewPrompt(batch, categories);
  const response = await invokeKimiChat(messages, { temperature: 0.05, maxTokens: 1600 });
  const jsonText = extractJsonObject(response.content);

  if (!jsonText) {
    if (retryLevel === 0 && batch.length > 1) {
      const retryResults = await Promise.all(batch.map((file) => invokeReviewBatch([file], categories, 1)));
      return retryResults.flat();
    }
    throw new Error("LLM 返回内容无法解析");
  }

  const parsed = JSON.parse(jsonText) as { results?: LlmReviewItem[] };
  const parsedResults = Array.isArray(parsed.results) ? parsed.results : [];
  const parsedIds = new Set(parsedResults.map((item) => String(item.id)));
  const batchIds = batch.map((file) => file.id);

  if (parsedResults.length === 0 || batchIds.some((id) => !parsedIds.has(id))) {
    if (retryLevel === 0 && batch.length > 1) {
      const retryResults = await Promise.all(batch.map((file) => invokeReviewBatch([file], categories, 1)));
      return retryResults.flat();
    }
    throw new Error("LLM 返回结果不完整");
  }

  const results: ReviewResult[] = batch.map((file) => {
    const matched = parsedResults.find((item) => String(item.id) === file.id);
    const titleParts = composeAdaptiveTitle({
      attribution: matched?.attribution,
      year: matched?.year,
      contentTitle: matched?.contentTitle,
      preferredTitle: typeof matched?.optimizedTitle === "string" && matched.optimizedTitle.trim()
        ? matched.optimizedTitle.trim()
        : file.title,
      fallbackTitle: file.title,
      fallbackFileName: file.fileName,
      fallbackText: file.extractedText || null,
    });
    const optimizedTitle = titleParts.optimizedTitle;
    const suggestedCategory = typeof matched?.suggestedCategory === "string" && matched.suggestedCategory.trim()
      ? matched.suggestedCategory.trim()
      : null;

    return {
      id: file.id,
      compliant: matched?.compliant !== false,
      complianceIssue: matched?.complianceIssue || null,
      categoryCorrect: matched?.categoryCorrect !== false,
      suggestedCategory,
      suggestedCategoryId: suggestedCategory ? categories.map[suggestedCategory] || null : null,
      optimizedTitle,
      titleChanged: matched?.titleChanged === true || optimizedTitle !== file.title,
      reason: matched?.reason || null,
    };
  });

  if (results.some((result) => !result.optimizedTitle)) {
    throw new Error("LLM 返回缺少有效标题");
  }

  return results;
}

// GET: 获取待审核文件列表
export async function GET(request: NextRequest) {
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

    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限访问" }, { status: 403 });
    }

    const categories = await getCategories(client);

    // 获取待审核文件（与资料管理页的“待审核”口径保持一致：is_active = false）
    const { data: files, error } = await client
      .from("files")
      .select("id, title, file_name, file_type, file_key, category_id, course, description")
      .is("ai_classified_at", null)
      .eq("is_active", false)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const fileList = (files || []).map(file => ({
      id: file.id,
      title: file.title,
      fileName: file.file_name,
      fileType: file.file_type,
      fileKey: file.file_key,
      currentCategory: categories.map[file.category_id] || "未分类",
      categoryId: file.category_id,
      course: file.course,
      description: file.description,
      needsContentExtraction: Boolean(file.file_key && (String(file.file_type || "").toLowerCase() === "pdf" || String(file.file_name || "").toLowerCase().endsWith(".pdf"))),
    }));

    return NextResponse.json({
      files: fileList,
      categories: categories.names,
      total: fileList.length,
      batchSize: BATCH_SIZE,
    });
  } catch (error) {
    console.error("Get files for review error:", error);
    return NextResponse.json({ error: "获取文件列表失败" }, { status: 500 });
  }
}

// POST: AI审核（直接调用LLM接口）
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

    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限操作" }, { status: 403 });
    }

    const body = await request.json();
    const { files } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "请提供需要审核的文件列表" }, { status: 400 });
    }

    const categories = await getCategories(client);
    const normalizedFiles = files.map((file: ReviewInputRecord) => normalizeFile(file, categories));

    console.log(`[AI审核] 总文件数: ${files.length}`);

    const filesNeedingContent = normalizedFiles.filter((file) => shouldExtractText(file));
    const contentResults = await mapWithConcurrency(
      filesNeedingContent,
      CONTENT_EXTRACTION_CONCURRENCY,
      async (f) => {
        const content = await extractFileContent(f.fileKey as string, f.fileType, 4);
        return { id: f.id, content };
      }
    );
    const contentMap = new Map(contentResults.map((r) => [r.id, r.content || null]));

    const reviewTargets = normalizedFiles.map((file) => ({
      ...file,
      extractedText: contentMap.get(file.id) || null,
    }));

    const reviewBatches = chunkArray(reviewTargets, REVIEW_LLM_BATCH_SIZE);
    const batchOutcomes = await mapWithConcurrency(
      reviewBatches,
      Math.min(3, reviewBatches.length || 1),
      async (batch) => {
        console.log(`[AI审核] 调用LLM处理 ${batch.length} 个文件`);
        try {
          const results = await invokeReviewBatch(batch, categories);
          return { results, failedIds: [] } satisfies BatchOutcome;
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI审核失败";
          console.error(`[AI审核] 批次处理失败: ${message}`);
          return {
            results: [],
            failedIds: batch.map((item) => item.id),
            error: message,
          } satisfies BatchOutcome;
        }
      }
    );

    const results = batchOutcomes.flatMap((batch) => batch.results);
    const failedIds = batchOutcomes.flatMap((batch) => batch.failedIds);

    // 计算统计信息
    const stats = {
      total: files.length,
      llmProcessed: normalizedFiles.length,
      contentExtracted: filesNeedingContent.length,
      batches: reviewBatches.length,
      compliant: results.filter((r) => r.compliant).length,
      nonCompliant: results.filter((r) => !r.compliant).length,
      categoryNeedFix: results.filter((r) => !r.categoryCorrect).length,
      titleNeedOptimize: results.filter((r) => r.titleChanged).length,
      failed: failedIds.length,
    };

    return NextResponse.json({
      results,
      failedIds,
      stats,
    });
  } catch (error) {
    console.error("AI review error:", error);
    const message = error instanceof Error ? error.message : "AI审核失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT: 确认并执行修改
export async function PUT(request: NextRequest) {
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

    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限操作" }, { status: 403 });
    }

    const body = await request.json();
    const { changes, allReviewedIds, publishIds } = body;
    const reviewedIds = Array.isArray(allReviewedIds) ? allReviewedIds : [];
    const idsToPublish = Array.isArray(publishIds) ? publishIds : [];
    const publishIdSet = new Set(idsToPublish);

    // 批量更新
    const now = new Date().toISOString();

    if ((!changes || changes.length === 0) && reviewedIds.length === 0) {
      return NextResponse.json({ error: "请提供修改内容" }, { status: 400 });
    }

    let successCount = 0;
    let failCount = 0;
    const publishRewardTargets = new Map<string, string>();
    let didPublishAny = false;

    const targetIds = [...new Set([
      ...reviewedIds,
      ...(changes?.map((change: { id: string }) => change.id) || []),
    ])];

    const { data: targetFiles, error: targetFilesError } = targetIds.length > 0
      ? await client
          .from("files")
          .select("id, uploader_id, is_active")
          .in("id", targetIds)
      : { data: [], error: null };

    if (targetFilesError) {
      return NextResponse.json({ error: targetFilesError.message }, { status: 500 });
    }

    const targetFileMap = new Map(
      (targetFiles || []).map((file) => [file.id, file as { id: string; uploader_id: string; is_active: boolean }])
    );

    // 先更新需要改分类/标题的文件
    if (changes?.length) {
      const changeResults = await Promise.all(changes.map(async (change: { id: string; suggestedCategoryId?: string | null; optimizedTitle?: string; titleChanged?: boolean }) => {
        const updateData: Record<string, string | boolean> = { ai_classified_at: now };

        if (change.suggestedCategoryId) {
          updateData.category_id = change.suggestedCategoryId;
        }
        if (change.optimizedTitle && change.titleChanged) {
          updateData.title = change.optimizedTitle;
        }

        if (publishIdSet.has(change.id)) {
          updateData.is_active = true;
          updateData.reviewed_at = now;
          updateData.reviewed_by = user.id;
        }

        const { error } = await client
          .from("files")
          .update(updateData)
          .eq("id", change.id);

        if (!error && publishIdSet.has(change.id)) {
          const targetFile = targetFileMap.get(change.id);
          if (targetFile && !targetFile.is_active) {
            publishRewardTargets.set(change.id, targetFile.uploader_id);
          }
          didPublishAny = true;
        }

        return { id: change.id, success: !error };
      }));

      successCount += changeResults.filter(r => r.success).length;
      failCount += changeResults.filter(r => !r.success).length;
    }

    // 其余已审核但无需改动的文件：只标记审核；如用户确认通过则直接上架
    const remainingReviewedIds = reviewedIds.filter((id: string) => !changes?.some((c: { id: string }) => c.id === id));
    if (remainingReviewedIds.length > 0) {
      const publishRemaining = remainingReviewedIds.filter((id: string) => publishIdSet.has(id));
      const markReviewedOnly = remainingReviewedIds.filter((id: string) => !publishIdSet.has(id));

      if (publishRemaining.length > 0) {
        const { error } = await client
          .from("files")
          .update({
            ai_classified_at: now,
            is_active: true,
            reviewed_at: now,
            reviewed_by: user.id,
          })
          .in("id", publishRemaining);

        if (error) {
          failCount += publishRemaining.length;
        } else {
          successCount += publishRemaining.length;
          didPublishAny = true;
          publishRemaining.forEach((id: string) => {
            const targetFile = targetFileMap.get(id);
            if (targetFile && !targetFile.is_active) {
              publishRewardTargets.set(id, targetFile.uploader_id);
            }
          });
        }
      }

      if (markReviewedOnly.length > 0) {
        const { error } = await client
          .from("files")
          .update({ ai_classified_at: now })
          .in("id", markReviewedOnly);

        if (error) {
          failCount += markReviewedOnly.length;
        } else {
          successCount += markReviewedOnly.length;
        }
      }
    }

    if (publishRewardTargets.size > 0) {
      await Promise.all(
        [...publishRewardTargets.entries()].map(([fileId, uploaderId]) => rewardPublishPoints(uploaderId, fileId))
      );
    }

    if (didPublishAny) {
      cache.delete("files:home");
    }

    return NextResponse.json({
      success: true,
      message: `成功处理 ${successCount} 个文件${failCount > 0 ? `，失败 ${failCount} 个` : ""}`,
      stats: { success: successCount, failed: failCount },
    });
  } catch (error) {
    console.error("Confirm changes error:", error);
    return NextResponse.json({ error: "确认修改失败" }, { status: 500 });
  }
}

// PATCH: 标记已审核
export async function PATCH(request: NextRequest) {
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

    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "volunteer") {
      return NextResponse.json({ error: "无权限操作" }, { status: 403 });
    }

    const body = await request.json();
    const { fileIds } = body;

    if (!fileIds?.length) {
      return NextResponse.json({ error: "请提供文件ID" }, { status: 400 });
    }

    const { error } = await client
      .from("files")
      .update({ ai_classified_at: new Date().toISOString() })
      .in("id", fileIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `已标记 ${fileIds.length} 个文件为已审核`,
    });
  } catch (error) {
    console.error("Mark files error:", error);
    return NextResponse.json({ error: "标记失败" }, { status: 500 });
  }
}
