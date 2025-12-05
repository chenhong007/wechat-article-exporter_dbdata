/**
 * 同步文章数据到后端
 * POST /api/web/sync/articles
 */

import { saveArticlesToBackend } from '~/server/utils/db-backend';
import type { AppMsgExWithFakeID } from '~/types/types';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      fakeid: string;
      articles: AppMsgExWithFakeID[];
      totalCount: number;
    }>(event);

    if (!body.fakeid || !body.articles || body.totalCount === undefined) {
      throw createError({
        statusCode: 400,
        message: '缺少必要参数: fakeid, articles, totalCount',
      });
    }

    await saveArticlesToBackend(body.fakeid, body.articles, body.totalCount);

    return {
      success: true,
      message: `成功同步 ${body.articles.length} 篇文章`,
      fakeid: body.fakeid,
      count: body.articles.length,
    };
  } catch (error: any) {
    console.error('同步文章到后端失败:', error);
    throw createError({
      statusCode: 500,
      message: error.message || '同步文章失败',
    });
  }
});

