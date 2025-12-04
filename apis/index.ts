import { request } from '#shared/utils/request';
import { ACCOUNT_LIST_PAGE_SIZE, ARTICLE_LIST_PAGE_SIZE } from '~/config';
import { updateArticleCache } from '~/store/v2/article';
import { type Info, updateLastUpdateTime } from '~/store/v2/info';
import type { CommentResponse } from '~/types/comment';
import type {
  AccountInfo,
  AppMsgEx,
  AppMsgPublishResponse,
  PublishInfo,
  PublishPage,
  SearchBizResponse,
} from '~/types/types';

const loginAccount = useLoginAccount();

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

/**
 * 获取文章列表
 * @param account
 * @param begin
 * @param keyword
 */
export async function getArticleList(account: Info, begin = 0, keyword = ''): Promise<[AppMsgEx[], boolean, number]> {
  // 验证 fakeid 参数
  if (!isValidFakeid(account.fakeid)) {
    throw new Error(`无效的公众号 ID (fakeid)，请检查公众号数据是否完整。公众号名称: ${account.nickname || '未知'}`);
  }

  // 构建查询参数，只在有关键词时才包含 keyword 参数
  const queryParams: Record<string, any> = {
    id: account.fakeid,
    begin: begin,
    size: ARTICLE_LIST_PAGE_SIZE,
  };
  
  // 只在有搜索关键词时才添加 keyword 参数
  if (keyword) {
    queryParams.keyword = keyword;
  }

  const resp = await request<AppMsgPublishResponse>('/api/web/mp/appmsgpublish', {
    query: queryParams,
  });

  if (resp.base_resp.ret === 0) {
    const publish_page: PublishPage = JSON.parse(resp.publish_page);
    const publish_list = publish_page.publish_list.filter(item => !!item.publish_info);

    // 返回的文章数量为0就表示已加载完毕
    const isCompleted = publish_list.length === 0;

    // 更新缓存，注意带有关键字搜索的结果不能写入缓存
    if (!keyword) {
      try {
        await updateArticleCache(account, publish_page);
      } catch (e) {
        console.error('写入文章缓存失败:', e);
      }
    }

    if (begin === 0) {
      await updateLastUpdateTime(account.fakeid);
    }

    const articles = publish_list.flatMap(item => {
      const publish_info: PublishInfo = JSON.parse(item.publish_info);
      return publish_info.appmsgex;
    });
    return [articles, isCompleted, publish_page.total_count];
  } else if (resp.base_resp.ret === 200003) {
    loginAccount.value = null;
    throw new Error('session expired');
  } else {
    throw new Error(`${resp.base_resp.ret}:${resp.base_resp.err_msg}`);
  }
}

/**
 * 获取公众号列表
 * @param begin
 * @param keyword
 */
export async function getAccountList(begin = 0, keyword = ''): Promise<[AccountInfo[], boolean]> {
  // 验证 keyword 参数（虽然可以为空，但不应该是异常值）
  if (keyword && typeof keyword !== 'string') {
    throw new Error('无效的搜索关键词参数');
  }

  const resp = await request<SearchBizResponse>('/api/web/mp/searchbiz', {
    query: {
      begin: begin,
      size: ACCOUNT_LIST_PAGE_SIZE,
      keyword: keyword,
    },
  });

  if (resp.base_resp.ret === 0) {
    // 公众号判断是否结束的逻辑与文章不太一样
    // 当第一页的结果就少于5个则结束，否则只有当搜索结果为空才表示结束
    const isCompleted = begin === 0 ? resp.total < ACCOUNT_LIST_PAGE_SIZE : resp.total === 0;

    return [resp.list, isCompleted];
  } else if (resp.base_resp.ret === 200003) {
    loginAccount.value = null;
    throw new Error('session expired');
  } else {
    throw new Error(`${resp.base_resp.ret}:${resp.base_resp.err_msg}`);
  }
}

/**
 * 获取评论
 * @param commentId
 */
export async function getComment(commentId: string) {
  try {
    // 本地设置的 credentials
    const credentials = JSON.parse(window.localStorage.getItem('credentials')!);
    if (!credentials || !credentials.__biz || !credentials.pass_ticket || !credentials.key || !credentials.uin) {
      console.warn('credentials not set');
      return null;
    }
    const response = await request<CommentResponse>('/api/web/misc/comment', {
      query: {
        comment_id: commentId,
        ...credentials,
      },
    });
    if (response.base_resp.ret === 0) {
      return response;
    } else {
      return null;
    }
  } catch (e) {
    console.warn('credentials parse error', e);
    return null;
  }
}
