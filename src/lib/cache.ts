/**
 * 简单内存缓存工具
 * 用于缓存频繁访问的数据，减少数据库查询
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 每 5 分钟清理过期缓存
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * 设置缓存
   * @param key 缓存键
   * @param data 缓存数据
   * @param ttlSeconds 过期时间（秒），默认 5 分钟
   */
  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { data, expiresAt });
  }

  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存数据，如果不存在或已过期则返回 undefined
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * 获取缓存，如果不存在则执行 getter 函数并缓存结果
   * @param key 缓存键
   * @param getter 获取数据的函数
   * @param ttlSeconds 过期时间（秒）
   */
  async getOrSet<T>(
    key: string,
    getter: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const data = await getter();
    this.set(key, data, ttlSeconds);
    return data;
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 删除匹配模式的缓存
   * @param pattern 缓存键前缀
   */
  deleteByPattern(pattern: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// 全局缓存实例
export const cache = new MemoryCache();

// 缓存键常量
export const CACHE_KEYS = {
  CATEGORIES: "categories:all",
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,
  USER_POINTS: (userId: string) => `user:points:${userId}`,
  FILE_DETAILS: (fileId: string) => `file:details:${fileId}`,
  FEATURED_FILES: "files:featured",
  FILE_LIST: (categoryId: string, page: number) => `files:list:${categoryId}:${page}`,
} as const;

// 缓存过期时间常量（秒）
export const CACHE_TTL = {
  SHORT: 60, // 1 分钟
  MEDIUM: 300, // 5 分钟
  LONG: 3600, // 1 小时
  VERY_LONG: 86400, // 1 天
} as const;
