import { ensureEnvLoaded } from "@/lib/env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface KimiChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface KimiChatResponse {
  content: string;
  raw: unknown;
}

export async function invokeKimiChat(
  messages: ChatMessage[],
  options: KimiChatOptions = {}
): Promise<KimiChatResponse> {
  ensureEnvLoaded();

  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "moonshot-v1-8k";

  if (!apiKey) {
    throw new Error("未配置 LLM_API_KEY");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      ...(typeof options.maxTokens === "number" ? { max_tokens: options.maxTokens } : {}),
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Kimi API 调用失败(${response.status}): ${text.slice(0, 500)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Kimi API 返回非 JSON 内容: ${text.slice(0, 500)}`);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`Kimi API 返回缺少有效内容: ${text.slice(0, 500)}`);
  }

  return {
    content,
    raw: parsed,
  };
}
