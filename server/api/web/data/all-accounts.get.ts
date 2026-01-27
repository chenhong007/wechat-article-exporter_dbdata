/**
 * 获取后端存储的所有公众号信息
 * GET /api/web/data/all-accounts
 * 用于在本地 IndexedDB 为空时恢复数据
 */

import { getAllInfosFromBackend, batchGetArticlesFromBackend } from '~/server/utils/db-backend';

export default defineEventHandler(async (event) => {
  try {
    // 获取所有公众号信息
    const infos = await getAllInfosFromBackend();
    
    // 获取所有文章数据的 fakeid
    const fakeids = infos.map(info => info.fakeid);
    
    // 批量获取文章数据
    const articlesMap = await batchGetArticlesFromBackend(fakeids, null);
    
    // 组合数据
    const accounts = infos.map(info => {
      const articleData = articlesMap.get(info.fakeid);
      return {
        info,
        articles: articleData?.articles || [],
        lastSync: articleData?.lastSync || null,
        totalCount: articleData?.totalCount || 0,
      };
    });

    return {
      success: true,
      accounts,
      count: accounts.length,
    };
  } catch (error: any) {
    console.error('获取所有公众号数据失败:', error);
    throw createError({
      statusCode: 500,
      message: error.message || '获取所有公众号数据失败',
    });
  }
});

