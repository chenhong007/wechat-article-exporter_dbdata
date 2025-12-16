import { db } from './db';

export interface HtmlAsset {
  fakeid: string;
  url: string;
  file: Blob;
  title: string;
  commentID: string | null;
}

/**
 * 更新 html 缓存
 * @param html 缓存
 */
export async function updateHtmlCache(html: HtmlAsset): Promise<boolean> {
  return db.transaction('rw', 'html', () => {
    db.html.put(html);
    return true;
  });
}

/**
 * 获取 asset 缓存
 * @param url
 */
export async function getHtmlCache(url: string): Promise<HtmlAsset | undefined> {
  return db.html.get(url);
}

/**
 * 批量检查 HTML 缓存是否存在
 * @param urls 文章链接数组
 * @returns 已缓存的 URL 集合
 */
export async function batchCheckHtmlCache(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  
  // 使用 bulkGet 批量获取，只检查是否存在
  const results = await db.html.bulkGet(urls);
  const cachedUrls = new Set<string>();
  
  for (let i = 0; i < urls.length; i++) {
    if (results[i] !== undefined) {
      cachedUrls.add(urls[i]);
    }
  }
  
  return cachedUrls;
}
