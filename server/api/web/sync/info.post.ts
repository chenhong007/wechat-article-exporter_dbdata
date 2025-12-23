/**
 * 同步公众号信息到后端
 * POST /api/web/sync/info
 */

import { saveInfoToBackend } from '~/server/utils/db-backend';
import type { Info } from '~/store/v2/info';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      info: Info;
    }>(event);

    if (!body.info || !body.info.fakeid) {
      throw createError({
        statusCode: 400,
        message: '缺少必要参数: info, info.fakeid',
      });
    }

    await saveInfoToBackend(body.info);

    return {
      success: true,
      message: '成功同步公众号信息',
      fakeid: body.info.fakeid,
    };
  } catch (error: any) {
    console.error('同步公众号信息失败:', error);
    throw createError({
      statusCode: 500,
      message: error.message || '同步公众号信息失败',
    });
  }
});

