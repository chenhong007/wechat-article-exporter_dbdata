import { db } from './db';

export interface CommentAsset {
  fakeid: string;
  url: string;
  title: string;
  data: any;
}

/**
 * 更新 comment 缓存
 * @param comment 缓存
 */
export async function updateCommentCache(comment: CommentAsset): Promise<boolean> {
  return db.transaction('rw', 'comment', () => {
    db.comment.put(comment);
    return true;
  });
}

/**
 * 获取 comment 缓存
 * @param url
 */
export async function getCommentCache(url: string): Promise<CommentAsset | undefined> {
  return db.comment.get(url);
}

/**
 * 批量检查 comment 缓存是否存在
 * @param urls 文章链接数组
 * @returns 已缓存的 URL 集合
 */
export async function batchCheckCommentCache(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  
  const results = await db.comment.bulkGet(urls);
  const cachedUrls = new Set<string>();
  
  for (let i = 0; i < urls.length; i++) {
    if (results[i] !== undefined) {
      cachedUrls.add(urls[i]);
    }
  }
  
  return cachedUrls;
}
