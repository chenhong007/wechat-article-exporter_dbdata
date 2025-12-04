/**
 * 从后端获取文章数据
 * GET /api/web/data/articles?fakeid=xxx
 */

import { getArticlesFromBackend } from '~/server/utils/db-backend';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const fakeid = query.fakeid as string;

    if (!fakeid) {
      throw createError({
        statusCode: 400,
        message: '缺少必要参数: fakeid',
      });
    }

    const data = await getArticlesFromBackend(fakeid);

    if (!data) {
      return {
        success: false,
        message: '未找到该公众号的数据',
        fakeid,
        articles: [],
        lastSync: null,
        totalCount: 0,
      };
    }

    return {
      success: true,
      fakeid: data.fakeid,
      articles: data.articles,
      lastSync: data.lastSync,
      totalCount: data.totalCount,
    };
  } catch (error: any) {
    console.error('从后端获取文章失败:', error);
    throw createError({
      statusCode: 500,
      message: error.message || '获取文章数据失败',
    });
  }
});

