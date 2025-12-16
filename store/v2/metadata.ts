import type { ArticleMetadata } from '~/utils/download/types';
import { db } from './db';

export type Metadata = ArticleMetadata & {
  fakeid: string;
  url: string;
  title: string;
};

/**
 * 更新 metadata
 * @param metadata
 */
export async function updateMetadataCache(metadata: Metadata): Promise<boolean> {
  return db.transaction('rw', 'metadata', () => {
    db.metadata.put(metadata);
    return true;
  });
}

/**
 * 获取 metadata
 * @param url
 */
export async function getMetadataCache(url: string): Promise<Metadata | undefined> {
  return db.metadata.get(url);
}

/**
 * 批量获取 metadata
 * @param urls 文章链接数组
 * @returns URL 到 Metadata 的映射
 */
export async function batchGetMetadataCache(urls: string[]): Promise<Map<string, Metadata>> {
  if (urls.length === 0) return new Map();
  
  const results = await db.metadata.bulkGet(urls);
  const metadataMap = new Map<string, Metadata>();
  
  for (let i = 0; i < urls.length; i++) {
    const metadata = results[i];
    if (metadata !== undefined) {
      metadataMap.set(urls[i], metadata);
    }
  }
  
  return metadataMap;
}
