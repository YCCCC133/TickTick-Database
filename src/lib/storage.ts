import COS from "cos-nodejs-sdk-v5";
import { ensureEnvLoaded } from "@/lib/env";

// ============================================================================
// 腾讯云 COS 存储模块
// 使用腾讯云官方 SDK
// ============================================================================

// 配置类型
interface COSConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
}

// 客户端缓存
let cosClient: COS | null = null;
let configCache: COSConfig | null = null;

// 获取配置（带缓存）
function getConfig(): COSConfig {
  ensureEnvLoaded();

  if (!configCache) {
    const secretId = process.env.COS_SECRET_ID || process.env.TENCENT_SECRET_ID || "";
    const secretKey = process.env.COS_SECRET_KEY || process.env.TENCENT_SECRET_KEY || "";
    const bucket = process.env.COS_BUCKET_NAME || "ycccc-1333091364";
    const region = process.env.COS_REGION || "ap-beijing";

    if (!secretId || !secretKey) {
      throw new Error("腾讯云COS密钥未配置，请设置环境变量 COS_SECRET_ID 和 COS_SECRET_KEY");
    }

    configCache = { secretId, secretKey, bucket, region };
    console.log(`[COS] 配置加载: bucket=${bucket}, region=${region}`);
  }
  return configCache;
}

// 获取 COS 客户端（单例模式）
function getClient(): COS {
  if (!cosClient) {
    const config = getConfig();
    cosClient = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
    });
    console.log("[COS] 客户端初始化完成");
  }
  return cosClient;
}

/**
 * 生成安全的文件 key
 * 格式: files/{timestamp}_{random}.{ext}
 */
export function generateFileKey(fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  
  // 提取并清理扩展名
  const lastDot = fileName.lastIndexOf('.');
  let ext = '';
  if (lastDot > 0) {
    const rawExt = fileName.slice(lastDot).toLowerCase();
    const cleanExt = rawExt.replace(/[^a-z0-9]/g, '');
    if (cleanExt.length > 0 && cleanExt.length <= 10) {
      ext = '.' + cleanExt;
    }
  }
  
  return `files/${timestamp}_${random}${ext}`;
}

// ============================================================================
// 核心上传接口
// ============================================================================

/**
 * 上传文件到 COS
 * @param file 文件内容（Buffer）
 * @param fileName 原始文件名
 * @param mimeType MIME 类型
 * @returns 文件 key
 */
export async function uploadFile(
  file: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const client = getClient();
  const config = getConfig();
  const key = generateFileKey(fileName);
  
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    client.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Body: file,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000",
    }, (err) => {
      if (err) {
        console.error(`[COS] 上传失败: ${fileName}`, err);
        reject(new Error(`文件上传失败: ${err.message}`));
      } else {
        const duration = Date.now() - startTime;
        const sizeKB = (file.length / 1024).toFixed(1);
        console.log(`[COS] 上传成功: ${key} (${sizeKB}KB, ${duration}ms)`);
        resolve(key);
      }
    });
  });
}

/**
 * 流式上传
 */
export async function uploadStream(
  stream: AsyncIterable<Buffer> | NodeJS.ReadableStream,
  fileName: string,
  mimeType: string
): Promise<string> {
  // 将流转换为 Buffer
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  
  return uploadFile(buffer, fileName, mimeType);
}

/**
 * 生成浏览器直传 COS 的预签名上传 URL
 */
export async function getUploadUrl(
  key: string,
  expireTime: number = 3600,
  mimeType?: string
): Promise<string> {
  const client = getClient();
  const config = getConfig();

  return new Promise((resolve) => {
    client.getObjectUrl({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Sign: true,
      Method: "PUT",
      Expires: expireTime,
      Headers: mimeType ? { "Content-Type": mimeType } : undefined,
    }, (err, data) => {
      if (err) {
        console.error(`[COS] 上传URL生成失败: ${key}`, err);
        resolve("");
      } else {
        let url = data.Url;
        if (url && !url.startsWith("http")) {
          url = `https://${url}`;
        }
        resolve(url);
      }
    });
  });
}

/**
 * 获取对象元信息
 */
export async function headFile(key: string): Promise<{ contentLength?: number } | null> {
  const client = getClient();
  const config = getConfig();

  return new Promise((resolve) => {
    client.headObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    }, (err, data) => {
      if (err) {
        console.error(`[COS] HEAD失败: ${key}`, err);
        resolve(null);
      } else {
        const result = data as { ContentLength?: number; headers?: Record<string, string | number | string[] | undefined> };
        const contentLength = Number(result.ContentLength || result.headers?.["content-length"] || result.headers?.["Content-Length"] || 0) || undefined;
        resolve({ contentLength });
      }
    });
  });
}

/**
 * 从 URL 下载并上传到 COS
 */
export async function uploadFromUrl(url: string, timeout: number = 30000): Promise<string> {
  const startTime = Date.now();
  
  try {
    // 使用 AbortController 实现超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // 从 URL 提取文件名
    const urlPath = new URL(url).pathname;
    const fileName = urlPath.split('/').pop() || `download_${Date.now()}`;
    
    // 从 response 获取 content-type
    const mimeType = response.headers.get("content-type") || "application/octet-stream";
    
    const key = await uploadFile(buffer, fileName, mimeType);
    
    const duration = Date.now() - startTime;
    console.log(`[COS] URL上传成功: ${key} (${duration}ms)`);
    
    return key;
  } catch (error) {
    console.error(`[COS] URL上传失败: ${url}`, error);
    throw new Error(`从URL上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// ============================================================================
// 文件访问接口
// ============================================================================

/**
 * 获取文件预签名 URL
 * @param key 文件 key
 * @param expireTime 过期时间（秒），默认7天
 * @returns 预签名 URL
 */
export async function getFileUrl(key: string, expireTime: number = 604800): Promise<string> {
  const client = getClient();
  const config = getConfig();
  
  return new Promise((resolve) => {
    client.getObjectUrl({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Sign: true,
      Expires: expireTime,
    }, (err, data) => {
      if (err) {
        console.error(`[COS] URL生成失败: ${key}`, err);
        resolve("");
      } else {
        // data.Url 返回的是完整URL，包含签名参数
        // 如果URL不以http开头，需要添加协议
        let url = data.Url;
        if (url && !url.startsWith('http')) {
          url = `https://${url}`;
        }
        console.log(`[COS] URL生成成功: ${key} -> ${url.substring(0, 80)}...`);
        resolve(url);
      }
    });
  });
}

/**
 * 获取下载URL（带文件名）
 */
export async function getDownloadUrl(
  key: string, 
  fileName: string, 
  expireTime: number = 3600
): Promise<string> {
  const client = getClient();
  const config = getConfig();
  
  return new Promise((resolve) => {
    client.getObjectUrl({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Sign: true,
      Expires: expireTime,
      Query: {
        'response-content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    }, (err, data) => {
      if (err) {
        console.error(`[COS] 下载URL生成失败: ${key}`, err);
        resolve("");
      } else {
        resolve(data.Url);
      }
    });
  });
}

/**
 * 读取文件内容
 * @returns 文件 Buffer，失败返回 null
 */
export async function readFile(key: string): Promise<Buffer | null> {
  const client = getClient();
  const config = getConfig();
  
  return new Promise((resolve) => {
    client.getObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    }, (err, data) => {
      if (err) {
        console.error(`[COS] 读取文件失败: ${key}`, err);
        resolve(null);
      } else {
        resolve(data.Body as Buffer);
      }
    });
  });
}

// ============================================================================
// 文件管理接口
// ============================================================================

/**
 * 删除单个文件
 */
export async function deleteFile(key: string): Promise<boolean> {
  const client = getClient();
  const config = getConfig();
  
  return new Promise((resolve) => {
    client.deleteObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    }, (err) => {
      if (err) {
        console.error(`[COS] 删除失败: ${key}`, err);
        resolve(false);
      } else {
        console.log(`[COS] 删除成功: ${key}`);
        resolve(true);
      }
    });
  });
}

/**
 * 批量删除文件
 */
export async function deleteFiles(keys: string[]): Promise<{ 
  success: string[]; 
  failed: string[];
  deleted: number;
}> {
  if (keys.length === 0) {
    return { success: [], failed: [], deleted: 0 };
  }
  
  const client = getClient();
  const config = getConfig();
  
  return new Promise((resolve) => {
    client.deleteMultipleObject({
      Bucket: config.bucket,
      Region: config.region,
      Objects: keys.map(key => ({ Key: key })),
    }, (err, data) => {
      if (err) {
        console.error(`[COS] 批量删除失败:`, err);
        resolve({ success: [], failed: keys, deleted: 0 });
      } else {
        const deleted = (data.Deleted || []).map((item) => item.Key);
        const errors = (data.Error || []).map((item) => item.Key);
        console.log(`[COS] 批量删除完成: 成功 ${deleted.length}, 失败 ${errors.length}`);
        resolve({ success: deleted, failed: errors, deleted: deleted.length });
      }
    });
  });
}

/**
 * 检查文件是否存在
 */
export async function fileExists(key: string): Promise<boolean> {
  const client = getClient();
  const config = getConfig();
  
  return new Promise((resolve) => {
    client.headObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * 获取文件元信息
 */
export async function getFileMetadata(key: string): Promise<{
  exists: boolean;
  size?: number;
  lastModified?: string;
  contentType?: string;
  etag?: string;
}> {
  const client = getClient();
  const config = getConfig();
  
  return new Promise((resolve) => {
    client.headObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    }, (err, data) => {
      if (err) {
        resolve({ exists: false });
      } else {
        resolve({
          exists: true,
          size: data.headers?.['content-length'] ? parseInt(data.headers['content-length']) : undefined,
          lastModified: data.headers?.['last-modified'],
          contentType: data.headers?.['content-type'],
          etag: data.headers?.['etag'],
        });
      }
    });
  });
}

/**
 * 列出文件
 */
export async function listFiles(
  prefix?: string, 
  maxKeys: number = 1000
): Promise<string[]> {
  const client = getClient();
  const config = getConfig();
  
  return new Promise((resolve) => {
    client.getBucket({
      Bucket: config.bucket,
      Region: config.region,
      Prefix: prefix,
      MaxKeys: maxKeys,
    }, (err, data) => {
      if (err) {
        console.error(`[COS] 列出文件失败:`, err);
        resolve([]);
      } else {
        resolve((data.Contents || []).map(obj => obj.Key));
      }
    });
  });
}

// ============================================================================
// 存储信息接口
// ============================================================================

/**
 * 获取存储桶名称
 */
export function getBucketName(): string {
  return getConfig().bucket;
}

/**
 * 获取区域
 */
export function getRegion(): string {
  return getConfig().region;
}

/**
 * 重置客户端（用于配置更新时）
 */
export function resetClient(): void {
  cosClient = null;
  configCache = null;
  console.log("[COS] 客户端已重置");
}
