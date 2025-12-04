/**
 * 批量同步多个公众号的文章数据到后端
 * POST /api/web/sync/batch-articles
 */

import { batchSaveArticlesToBackend } from '~/server/utils/db-backend';
import type { AppMsgExWithFakeID } from '~/types/types';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      accounts: Array<{
        fakeid: string;
        articles: AppMsgExWithFakeID[];
        totalCount: number;
      }>;
    }>(event);

    if (!body.accounts || !Array.isArray(body.accounts)) {
      throw createError({
        statusCode: 400,
        message: '缺少必要参数: accounts',
      });
    }

    await batchSaveArticlesToBackend(body.accounts);

    const totalArticles = body.accounts.reduce((sum, acc) => sum + acc.articles.length, 0);

    return {
      success: true,
      message: `成功同步 ${body.accounts.length} 个公众号的 ${totalArticles} 篇文章`,
      accountCount: body.accounts.length,
      totalArticles,
    };
  } catch (error: any) {
    console.error('批量同步文章到后端失败:', error);
    throw createError({
      statusCode: 500,
      message: error.message || '批量同步文章失败',
    });
  }
});

