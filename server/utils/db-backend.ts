/**
 * 后端数据库存储工具
 * 使用 Nitro Storage 作为统一的存储层
 * 支持多种后端：文件系统、Cloudflare KV、D1 等
 */

import type { AppMsgExWithFakeID } from '~/types/types';
import type { Info } from '~/store/v2/info';

// 存储键前缀
const STORAGE_PREFIX = {
  ARTICLE: 'article',
  INFO: 'info',
  METADATA: 'metadata',
  HTML: 'html',
  COMMENT: 'comment',
} as const;

/**
 * 文章数据存储结构
 */
export interface ArticleStorage {
  fakeid: string;
  articles: AppMsgExWithFakeID[];
  lastSync: number; // 最后同步时间戳
  totalCount: number;
}

/**
 * 保存文章数据到后端存储
 * @param fakeid 公众号ID
 * @param articles 文章列表
 * @param totalCount 总文章数
 */
export async function saveArticlesToBackend(
  fakeid: string,
  articles: AppMsgExWithFakeID[],
  totalCount: number
): Promise<void> {
  const storage = useStorage('data');
  const key = `${STORAGE_PREFIX.ARTICLE}:${fakeid}`;
  
  const data: ArticleStorage = {
    fakeid,
    articles,
    lastSync: Date.now(),
    totalCount,
  };
  
  await storage.setItem(key, data);
}

/**
 * 从后端存储获取文章数据
 * @param fakeid 公众号ID
 * @returns 文章数据，如果不存在返回 null
 */
export async function getArticlesFromBackend(
  fakeid: string
): Promise<ArticleStorage | null> {
  const storage = useStorage('data');
  const key = `${STORAGE_PREFIX.ARTICLE}:${fakeid}`;
  
  const data = await storage.getItem<ArticleStorage>(key);
  return data || null;
}

/**
 * 批量保存文章数据
 * @param accountArticles 多个公众号的文章数据
 */
export async function batchSaveArticlesToBackend(
  accountArticles: Array<{
    fakeid: string;
    articles: AppMsgExWithFakeID[];
    totalCount: number;
  }>
): Promise<void> {
  const storage = useStorage('data');
  
  await Promise.all(
    accountArticles.map(async ({ fakeid, articles, totalCount }) => {
      const key = `${STORAGE_PREFIX.ARTICLE}:${fakeid}`;
      const data: ArticleStorage = {
        fakeid,
        articles,
        lastSync: Date.now(),
        totalCount,
      };
      await storage.setItem(key, data);
    })
  );
}

/**
 * 批量获取文章数据
 * @param fakeids 公众号ID列表
 * @returns 文章数据映射表
 */
export async function batchGetArticlesFromBackend(
  fakeids: string[],
  timeRange?: { start: number; end: number } | null
): Promise<Map<string, ArticleStorage>> {
  const storage = useStorage('data');
  const result = new Map<string, ArticleStorage>();
  
  await Promise.all(
    fakeids.map(async (fakeid) => {
      const key = `${STORAGE_PREFIX.ARTICLE}:${fakeid}`;
      const data = await storage.getItem<ArticleStorage>(key);
      if (data) {
        const filteredArticles = timeRange
          ? data.articles.filter(article => (
            article.update_time >= timeRange.start && article.update_time <= timeRange.end
          ))
          : data.articles;

        result.set(fakeid, {
          ...data,
          articles: filteredArticles,
        });
      }
    })
  );
  
  return result;
}

/**
 * 保存公众号信息到后端
 * @param info 公众号信息
 */
export async function saveInfoToBackend(info: Info): Promise<void> {
  const storage = useStorage('data');
  const key = `${STORAGE_PREFIX.INFO}:${info.fakeid}`;
  
  await storage.setItem(key, {
    ...info,
    lastSync: Date.now(),
  });
}

/**
 * 从后端获取公众号信息
 * @param fakeid 公众号ID
 */
export async function getInfoFromBackend(fakeid: string): Promise<Info | null> {
  const storage = useStorage('data');
  const key = `${STORAGE_PREFIX.INFO}:${fakeid}`;
  
  const data = await storage.getItem<Info>(key);
  return data || null;
}

/**
 * 批量获取所有公众号信息
 */
export async function getAllInfosFromBackend(): Promise<Info[]> {
  const storage = useStorage('data');
  const keys = await storage.getKeys(STORAGE_PREFIX.INFO);
  
  const infos: Info[] = [];
  for (const key of keys) {
    const data = await storage.getItem<Info>(key);
    if (data) {
      infos.push(data);
    }
  }
  
  return infos;
}

/**
 * 删除公众号的所有数据
 * @param fakeid 公众号ID
 */
export async function deleteAccountDataFromBackend(fakeid: string): Promise<void> {
  const storage = useStorage('data');
  
  // 删除所有相关数据
  const keysToDelete = [
    `${STORAGE_PREFIX.ARTICLE}:${fakeid}`,
    `${STORAGE_PREFIX.INFO}:${fakeid}`,
  ];
  
  await Promise.all(keysToDelete.map(key => storage.removeItem(key)));
}

/**
 * 检查后端数据是否需要刷新
 * @param fakeid 公众号ID
 * @param maxAge 最大缓存时间（毫秒），默认 1 小时
 * @returns 是否需要刷新
 */
export async function shouldRefreshFromBackend(
  fakeid: string,
  maxAge: number = 60 * 60 * 1000 // 1小时
): Promise<boolean> {
  const data = await getArticlesFromBackend(fakeid);
  
  if (!data) {
    return true; // 没有数据，需要刷新
  }
  
  const age = Date.now() - data.lastSync;
  return age > maxAge;
}

/**
 * 获取后端存储统计信息
 */
export async function getBackendStorageStats(): Promise<{
  accountCount: number;
  totalArticles: number;
  storageKeys: number;
}> {
  const storage = useStorage('data');
  const articleKeys = await storage.getKeys(STORAGE_PREFIX.ARTICLE);
  
  let totalArticles = 0;
  for (const key of articleKeys) {
    const data = await storage.getItem<ArticleStorage>(key);
    if (data) {
      totalArticles += data.articles.length;
    }
  }
  
  const allKeys = await storage.getKeys();
  
  return {
    accountCount: articleKeys.length,
    totalArticles,
    storageKeys: allKeys.length,
  };
}

