/**
 * 后端数据同步 Composable
 * 处理本地 IndexedDB 和后端服务器之间的数据同步
 */

import type { AppMsgExWithFakeID } from '~/types/types';
import { getArticleCache } from '~/store/v2/article';

/**
 * 本地缓存的过期时间（毫秒）
 * 默认 30 分钟
 */
const CACHE_EXPIRY_TIME = 30 * 60 * 1000;

/**
 * 缓存元数据键前缀
 */
const CACHE_META_KEY = 'backend-sync-meta';

interface CacheMeta {
  fakeid: string;
  lastSync: number;
  articleCount: number;
}

/**
 * 获取缓存元数据
 */
function getCacheMeta(fakeid: string): CacheMeta | null {
  const key = `${CACHE_META_KEY}:${fakeid}`;
  const data = localStorage.getItem(key);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * 设置缓存元数据
 */
function setCacheMeta(meta: CacheMeta): void {
  const key = `${CACHE_META_KEY}:${meta.fakeid}`;
  localStorage.setItem(key, JSON.stringify(meta));
}

/**
 * 检查本地缓存是否有效
 */
function isCacheValid(fakeid: string): boolean {
  const meta = getCacheMeta(fakeid);
  if (!meta) return false;
  
  const age = Date.now() - meta.lastSync;
  return age < CACHE_EXPIRY_TIME;
}

/**
 * 同步单个公众号的文章数据到后端
 */
export async function syncArticlesToBackend(
  fakeid: string,
  skipIfRecent = true
): Promise<{
  success: boolean;
  message: string;
  count: number;
}> {
  try {
    // 如果本地缓存有效且设置了跳过，则不同步
    if (skipIfRecent && isCacheValid(fakeid)) {
      const meta = getCacheMeta(fakeid);
      return {
        success: true,
        message: '使用本地缓存，跳过同步',
        count: meta?.articleCount || 0,
      };
    }

    // 从本地 IndexedDB 获取所有文章
    const articles = await getArticleCache(fakeid, Date.now());
    
    if (articles.length === 0) {
      return {
        success: false,
        message: '本地没有文章数据',
        count: 0,
      };
    }

    // 同步到后端
    const response = await $fetch('/api/web/sync/articles', {
      method: 'POST',
      body: {
        fakeid,
        articles,
        totalCount: articles.length,
      },
    });

    // 更新缓存元数据
    setCacheMeta({
      fakeid,
      lastSync: Date.now(),
      articleCount: articles.length,
    });

    return {
      success: true,
      message: `成功同步 ${articles.length} 篇文章到服务器`,
      count: articles.length,
    };
  } catch (error: any) {
    console.error('同步文章到后端失败:', error);
    return {
      success: false,
      message: error.message || '同步失败',
      count: 0,
    };
  }
}

/**
 * 批量同步多个公众号的文章数据到后端
 */
export async function batchSyncArticlesToBackend(
  fakeids: string[]
): Promise<{
  success: boolean;
  message: string;
  accountCount: number;
  totalArticles: number;
}> {
  try {
    const accounts = await Promise.all(
      fakeids.map(async (fakeid) => {
        const articles = await getArticleCache(fakeid, Date.now());
        return {
          fakeid,
          articles,
          totalCount: articles.length,
        };
      })
    );

    // 过滤掉没有数据的公众号
    const validAccounts = accounts.filter(acc => acc.articles.length > 0);

    if (validAccounts.length === 0) {
      return {
        success: false,
        message: '没有需要同步的数据',
        accountCount: 0,
        totalArticles: 0,
      };
    }

    const response = await $fetch('/api/web/sync/batch-articles', {
      method: 'POST',
      body: {
        accounts: validAccounts,
      },
    });

    // 更新所有公众号的缓存元数据
    for (const account of validAccounts) {
      setCacheMeta({
        fakeid: account.fakeid,
        lastSync: Date.now(),
        articleCount: account.articles.length,
      });
    }

    const totalArticles = validAccounts.reduce((sum, acc) => sum + acc.articles.length, 0);

    return {
      success: true,
      message: `成功同步 ${validAccounts.length} 个公众号的 ${totalArticles} 篇文章`,
      accountCount: validAccounts.length,
      totalArticles,
    };
  } catch (error: any) {
    console.error('批量同步文章到后端失败:', error);
    return {
      success: false,
      message: error.message || '批量同步失败',
      accountCount: 0,
      totalArticles: 0,
    };
  }
}

/**
 * 从后端获取文章数据（优先本地缓存）
 */
export async function getArticlesFromBackend(
  fakeid: string,
  forceRefresh = false
): Promise<{
  success: boolean;
  articles: AppMsgExWithFakeID[];
  source: 'cache' | 'backend' | 'local';
  lastSync: number | null;
}> {
  try {
    // 1. 如果不强制刷新，先检查本地缓存
    if (!forceRefresh && isCacheValid(fakeid)) {
      const articles = await getArticleCache(fakeid, Date.now());
      const meta = getCacheMeta(fakeid);
      
      return {
        success: true,
        articles,
        source: 'cache',
        lastSync: meta?.lastSync || null,
      };
    }

    // 2. 从后端获取
    const response = await $fetch<{
      success: boolean;
      articles: AppMsgExWithFakeID[];
      lastSync: number | null;
    }>(`/api/web/data/articles?fakeid=${fakeid}`);

    if (response.success && response.articles.length > 0) {
      // 更新缓存元数据
      setCacheMeta({
        fakeid,
        lastSync: Date.now(),
        articleCount: response.articles.length,
      });

      return {
        success: true,
        articles: response.articles,
        source: 'backend',
        lastSync: response.lastSync,
      };
    }

    // 3. 后端没有数据，尝试从本地获取
    const articles = await getArticleCache(fakeid, Date.now());
    
    return {
      success: articles.length > 0,
      articles,
      source: 'local',
      lastSync: null,
    };
  } catch (error: any) {
    console.error('从后端获取文章失败:', error);
    
    // 出错时回退到本地
    const articles = await getArticleCache(fakeid, Date.now());
    
    return {
      success: articles.length > 0,
      articles,
      source: 'local',
      lastSync: null,
    };
  }
}

/**
 * 批量从后端获取文章数据
 */
export async function batchGetArticlesFromBackend(
  fakeids: string[]
): Promise<Map<string, AppMsgExWithFakeID[]>> {
  try {
    const response = await $fetch<{
      success: boolean;
      data: Record<string, {
        articles: AppMsgExWithFakeID[];
        lastSync: number;
      }>;
    }>('/api/web/data/batch-articles', {
      method: 'POST',
      body: { fakeids },
    });

    const result = new Map<string, AppMsgExWithFakeID[]>();

    if (response.success) {
      for (const [fakeid, data] of Object.entries(response.data)) {
        result.set(fakeid, data.articles);
        
        // 更新缓存元数据
        setCacheMeta({
          fakeid,
          lastSync: Date.now(),
          articleCount: data.articles.length,
        });
      }
    }

    // 对于后端没有数据的公众号，从本地获取
    for (const fakeid of fakeids) {
      if (!result.has(fakeid)) {
        const articles = await getArticleCache(fakeid, Date.now());
        if (articles.length > 0) {
          result.set(fakeid, articles);
        }
      }
    }

    return result;
  } catch (error: any) {
    console.error('批量获取文章失败:', error);
    
    // 出错时从本地获取所有数据
    const result = new Map<string, AppMsgExWithFakeID[]>();
    for (const fakeid of fakeids) {
      const articles = await getArticleCache(fakeid, Date.now());
      if (articles.length > 0) {
        result.set(fakeid, articles);
      }
    }
    return result;
  }
}

/**
 * 清除指定公众号的缓存元数据
 */
export function clearCacheMeta(fakeid: string): void {
  const key = `${CACHE_META_KEY}:${fakeid}`;
  localStorage.removeItem(key);
}

/**
 * 获取后端存储统计信息
 */
export async function getBackendStorageStats(): Promise<{
  accountCount: number;
  totalArticles: number;
  storageKeys: number;
} | null> {
  try {
    const response = await $fetch<{
      success: boolean;
      accountCount: number;
      totalArticles: number;
      storageKeys: number;
    }>('/api/web/data/storage-stats');

    if (response.success) {
      return {
        accountCount: response.accountCount,
        totalArticles: response.totalArticles,
        storageKeys: response.storageKeys,
      };
    }

    return null;
  } catch (error: any) {
    console.error('获取存储统计失败:', error);
    return null;
  }
}

export default function useBackendSync() {
  return {
    syncArticlesToBackend,
    batchSyncArticlesToBackend,
    getArticlesFromBackend,
    batchGetArticlesFromBackend,
    clearCacheMeta,
    isCacheValid,
    getBackendStorageStats,
  };
}

