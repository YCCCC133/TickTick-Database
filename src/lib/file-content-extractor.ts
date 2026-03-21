import { readFile } from "./storage";

/**
 * 检测标题是否为无意义标题
 */
export function isMeaninglessTitle(title: string, fileName: string): boolean {
  // 移除扩展名
  const cleanName = fileName.replace(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i, "").trim();
  const cleanTitle = title.trim();
  
  // 1. 纯数字
  if (/^\d+$/.test(cleanTitle) || /^\d+$/.test(cleanName)) {
    return true;
  }
  
  // 2. 太短（少于3个字符）
  if (cleanTitle.length < 3) {
    return true;
  }
  
  // 3. 纯随机字符（只有字母数字，没有汉字或有效单词）
  const hasChinese = /[\u4e00-\u9fa5]/.test(cleanTitle);
  const hasValidWord = /[a-zA-Z]{3,}/.test(cleanTitle);
  if (!hasChinese && !hasValidWord && /^[a-zA-Z0-9\-_]+$/.test(cleanTitle)) {
    // 可能是随机文件名，进一步检查
    // 如果没有元音或者看起来像随机字符串
    const vowels = (cleanTitle.match(/[aeiou]/gi) || []).length;
    const consonants = cleanTitle.replace(/[aeiou0-9\-_]/gi, "").length;
    if (vowels === 0 || (consonants > vowels * 3)) {
      return true;
    }
  }
  
  // 4. 已被标记为无明确内容
  if (cleanTitle.includes("无明确内容标识") || cleanTitle.includes("无明确内容")) {
    return true;
  }
  
  // 5. 类似 "xxx资料文件" 但xxx很短
  if (cleanTitle.match(/^.?.?.?资料文件$/) || cleanTitle.match(/^.?.?.?相关资料$/)) {
    return true;
  }
  
  return false;
}

/**
 * 从 PDF 提取文本内容（服务端版本）
 * 使用 pdf-parse 库
 */
export async function extractPdfText(fileKey: string, maxPages: number = 5): Promise<string | null> {
  try {
    console.log(`[PDF提取] 开始提取: ${fileKey}`);
    
    // 从 COS 读取文件
    const buffer = await readFile(fileKey);
    if (!buffer) {
      console.error(`[PDF提取] 无法读取文件: ${fileKey}`);
      return null;
    }
    
    // 动态导入 pdf-parse
    const { PDFParse } = await import("pdf-parse");
    
    // 创建解析器（传入 data 参数）
    const parser = new PDFParse({ data: buffer });
    
    // 提取文本
    const result = await parser.getText({
      first: 1,
      last: maxPages,
    });
    
    // 提取所有页面的文本
    const text = result.text
      .replace(/\s+/g, " ")
      .trim();
    
    console.log(`[PDF提取] 提取完成, 文本长度: ${text.length}`);
    
    // 销毁解析器释放资源
    await parser.destroy();
    
    // 返回前 3000 字符（足够用于生成标题）
    return text.substring(0, 3000);
  } catch (error) {
    console.error(`[PDF提取] 提取失败: ${fileKey}`, error);
    return null;
  }
}

/**
 * 从文件提取内容（支持多种格式）
 */
export async function extractFileContent(
  fileKey: string, 
  fileType: string,
  maxPages: number = 5
): Promise<string | null> {
  // 目前只支持 PDF
  if (fileType === "pdf" || fileKey.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(fileKey, maxPages);
  }

  // 纯文本类文件直接读取
  if (["txt", "md", "csv", "json", "log"].includes(fileType) || /\.(txt|md|csv|json|log)$/i.test(fileKey)) {
    try {
      const buffer = await readFile(fileKey);
      if (!buffer) return null;
      return buffer.toString("utf-8").replace(/\s+/g, " ").trim().substring(0, 3000) || null;
    } catch (error) {
      console.error(`[内容提取] 文本读取失败: ${fileKey}`, error);
      return null;
    }
  }

  // 其他格式暂不支持
  console.log(`[内容提取] 不支持的文件类型: ${fileType}`);
  return null;
}
