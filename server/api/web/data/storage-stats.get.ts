/**
 * 获取后端存储统计信息
 * GET /api/web/data/storage-stats
 */

import { getBackendStorageStats } from '~/server/utils/db-backend';

export default defineEventHandler(async (event) => {
  try {
    const stats = await getBackendStorageStats();

    return {
      success: true,
      ...stats,
    };
  } catch (error: any) {
    console.error('获取存储统计失败:', error);
    throw createError({
      statusCode: 500,
      message: error.message || '获取存储统计失败',
    });
  }
});

