/**
 * 批量获取多个公众号的文章数据
 * POST /api/web/data/batch-articles
 */

import { batchGetArticlesFromBackend } from '~/server/utils/db-backend';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      fakeids: string[];
      timeRange?: { start: number; end: number };
    }>(event);

    if (!body.fakeids || !Array.isArray(body.fakeids)) {
      throw createError({
        statusCode: 400,
        message: '缺少必要参数: fakeids',
      });
    }

    if (body.timeRange) {
      const { start, end } = body.timeRange;
      if (typeof start !== 'number' || typeof end !== 'number') {
        throw createError({
          statusCode: 400,
          message: 'timeRange 必须包含合法的 start/end 时间戳',
        });
      }
    }

    const dataMap = await batchGetArticlesFromBackend(body.fakeids, body.timeRange ?? null);

    // 转换 Map 为普通对象
    const result: Record<string, {
      articles: any[];
      lastSync: number;
      totalCount: number;
    }> = {};

    for (const [fakeid, data] of dataMap.entries()) {
      result[fakeid] = {
        articles: data.articles,
        lastSync: data.lastSync,
        totalCount: data.totalCount,
      };
    }

    return {
      success: true,
      data: result,
      count: Object.keys(result).length,
    };
  } catch (error: any) {
    console.error('批量获取文章失败:', error);
    throw createError({
      statusCode: 500,
      message: error.message || '批量获取文章数据失败',
    });
  }
});

