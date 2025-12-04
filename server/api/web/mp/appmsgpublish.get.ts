/**
 * 获取文章列表接口
 */

import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

interface AppMsgPublishQuery {
  begin?: number;
  size?: number;
  id: string;
  keyword?: string;
}

/**
 * 验证 fakeid 是否有效
 * fakeid 应该是一个非空字符串，且长度合理（通常是 base64 编码）
 */
function isValidFakeid(fakeid: string | undefined | null): boolean {
  if (!fakeid || typeof fakeid !== 'string') {
    return false;
  }
  // 去除空白字符
  const trimmed = fakeid.trim();
  // fakeid 通常是 base64 编码的字符串，长度一般在 10-50 之间
  // 只包含字母、数字、+、/、= 字符
  const base64Pattern = /^[A-Za-z0-9+/=]{10,50}$/;
  return trimmed.length >= 10 && base64Pattern.test(trimmed);
}

export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);

  const query = getQuery<AppMsgPublishQuery>(event);
  const id = query.id;
  const keyword = query.keyword || '';
  const begin: number = query.begin || 0;
  const size: number = query.size || 5;

  // 验证 fakeid 参数
  if (!isValidFakeid(id)) {
    console.error('[appmsgpublish] 无效的 fakeid 参数:', id);
    return {
      base_resp: {
        ret: 200002,
        err_msg: '无效的公众号 ID 参数，请检查公众号数据是否完整',
      },
    };
  }

  const isSearching = !!keyword && keyword.trim().length > 0;

  const params: Record<string, string | number> = {
    sub: isSearching ? 'search' : 'list',
    begin: begin,
    count: size,
    fakeid: id,
    type: '101_1',
    free_publish_type: 1,
    sub_action: 'list_ex',
    token: token!,
    lang: 'zh_CN',
    f: 'json',
    ajax: 1,
  };

  // 只在搜索模式下添加 query 和 search_field 参数
  if (isSearching) {
    params.query = keyword;
    params.search_field = '7';
  }

  return proxyMpRequest({
    event: event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
    query: params,
    parseJson: true,
  }).catch(e => {
    console.error(e);
    return {
      base_resp: {
        ret: -1,
        err_msg: '获取文章列表接口失败，请重试',
      },
    };
  });
});
