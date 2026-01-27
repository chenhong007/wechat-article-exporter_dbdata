import initSqlJs, { type Database } from 'sql.js';
import { db } from '~/store/v2/db';

/**
 * DB 同步工具 - 用于在 SQLite 和 Dexie (IndexedDB) 之间导入导出数据
 */

// SQL.js 数据库实例缓存
let sqlInstance: any = null;

/**
 * 初始化 SQL.js
 */
async function initSql() {
  if (!sqlInstance) {
    sqlInstance = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`
    });
  }
  return sqlInstance;
}

/**
 * 从 SQLite DB 文件导入数据到 Dexie
 * @param file - SQLite DB 文件
 * @returns 导入的记录统计
 */
export async function importFromSqlite(file: File): Promise<{
  api: number;
  article: number;
  asset: number;
  comment: number;
  comment_reply: number;
  debug: number;
  html: number;
  info: number;
  metadata: number;
  resource: number;
  resource_map: number;
}> {
  const SQL = await initSql();
  
  // 读取文件
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // 打开 SQLite 数据库
  const sqlDb: Database = new SQL.Database(uint8Array);
  
  const stats = {
    api: 0,
    article: 0,
    asset: 0,
    comment: 0,
    comment_reply: 0,
    debug: 0,
    html: 0,
    info: 0,
    metadata: 0,
    resource: 0,
    resource_map: 0,
  };

  // 导入各个表的数据
  await db.transaction(
    'rw',
    [
      'api',
      'article',
      'asset',
      'comment',
      'comment_reply',
      'debug',
      'html',
      'info',
      'metadata',
      'resource',
      'resource-map',
    ],
    async () => {
      // 导入 info 表
      try {
        const infoResult = sqlDb.exec('SELECT * FROM info');
        if (infoResult.length > 0) {
          const columns = infoResult[0].columns;
          const values = infoResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              record[col] = row[idx];
            });
            await db.info.put(record);
            stats.info++;
          }
        }
      } catch (e) {
        console.warn('导入 info 表失败:', e);
      }

      // 导入 article 表（同时导入统计数据到 metadata）
      try {
        const articleResult = sqlDb.exec('SELECT * FROM article');
        if (articleResult.length > 0) {
          const columns = articleResult[0].columns;
          const values = articleResult[0].values;
          
          // 检查是否包含统计数据字段
          const hasStatsFields = columns.includes('readNum');
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              // 处理 JSON 字段
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  value = JSON.parse(value);
                } catch (e) {
                  // 保持原值
                }
              }
              record[col] = value;
            });
            
            // article 的主键是 fakeid:aid
            const key = `${record.fakeid}:${record.aid}`;
            await db.article.put(record, key);
            stats.article++;
            
            // 如果包含统计数据字段且有 link，同时写入 metadata 表
            if (hasStatsFields && record.link) {
              const hasAnyStats = (record.readNum || 0) > 0 || 
                                  (record.oldLikeNum || 0) > 0 || 
                                  (record.shareNum || 0) > 0 || 
                                  (record.likeNum || 0) > 0 || 
                                  (record.commentNum || 0) > 0;
              
              if (hasAnyStats) {
                const metadataRecord = {
                  url: record.link,
                  fakeid: record.fakeid,
                  title: record.title || '',
                  readNum: record.readNum || 0,
                  oldLikeNum: record.oldLikeNum || 0,
                  shareNum: record.shareNum || 0,
                  likeNum: record.likeNum || 0,
                  commentNum: record.commentNum || 0,
                };
                await db.metadata.put(metadataRecord);
                stats.metadata++;
              }
            }
          }
        }
      } catch (e) {
        console.warn('导入 article 表失败:', e);
      }

      // 导入 asset 表
      try {
        const assetResult = sqlDb.exec('SELECT * FROM asset');
        if (assetResult.length > 0) {
          const columns = assetResult[0].columns;
          const values = assetResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              // 处理 Blob 字段
              if (col === 'file' && value instanceof Uint8Array) {
                value = new Blob([value]);
              }
              record[col] = value;
            });
            await db.asset.put(record);
            stats.asset++;
          }
        }
      } catch (e) {
        console.warn('导入 asset 表失败:', e);
      }

      // 导入 comment 表
      try {
        const commentResult = sqlDb.exec('SELECT * FROM comment');
        if (commentResult.length > 0) {
          const columns = commentResult[0].columns;
          const values = commentResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  value = JSON.parse(value);
                } catch (e) {
                  // 保持原值
                }
              }
              record[col] = value;
            });
            await db.comment.put(record);
            stats.comment++;
          }
        }
      } catch (e) {
        console.warn('导入 comment 表失败:', e);
      }

      // 导入 comment_reply 表
      try {
        const commentReplyResult = sqlDb.exec('SELECT * FROM comment_reply');
        if (commentReplyResult.length > 0) {
          const columns = commentReplyResult[0].columns;
          const values = commentReplyResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  value = JSON.parse(value);
                } catch (e) {
                  // 保持原值
                }
              }
              record[col] = value;
            });
            
            // comment_reply 的主键是 url:contentID
            const key = `${record.url}:${record.contentID}`;
            await db.comment_reply.put(record, key);
            stats.comment_reply++;
          }
        }
      } catch (e) {
        console.warn('导入 comment_reply 表失败:', e);
      }

      // 导入 debug 表
      try {
        const debugResult = sqlDb.exec('SELECT * FROM debug');
        if (debugResult.length > 0) {
          const columns = debugResult[0].columns;
          const values = debugResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  value = JSON.parse(value);
                } catch (e) {
                  // 保持原值
                }
              }
              record[col] = value;
            });
            await db.debug.put(record);
            stats.debug++;
          }
        }
      } catch (e) {
        console.warn('导入 debug 表失败:', e);
      }

      // 导入 html 表
      try {
        const htmlResult = sqlDb.exec('SELECT * FROM html');
        if (htmlResult.length > 0) {
          const columns = htmlResult[0].columns;
          const values = htmlResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  value = JSON.parse(value);
                } catch (e) {
                  // 保持原值
                }
              }
              record[col] = value;
            });
            await db.html.put(record);
            stats.html++;
          }
        }
      } catch (e) {
        console.warn('导入 html 表失败:', e);
      }

      // 导入 metadata 表（支持新旧两种格式）
      try {
        const metadataResult = sqlDb.exec('SELECT * FROM metadata');
        if (metadataResult.length > 0) {
          const columns = metadataResult[0].columns;
          const values = metadataResult[0].values;
          
          // 检查是否是新格式（有 readNum 字段）还是旧格式（有 data 字段）
          const hasNewFormat = columns.includes('readNum');
          const hasOldFormat = columns.includes('data');
          
          for (const row of values) {
            let record: any = {};
            
            if (hasNewFormat) {
              // 新格式：各字段独立存储
              columns.forEach((col, idx) => {
                record[col] = row[idx];
              });
            } else if (hasOldFormat) {
              // 旧格式：从 data JSON 字段解析
              columns.forEach((col, idx) => {
                if (col === 'data' && typeof row[idx] === 'string') {
                  try {
                    const parsed = JSON.parse(row[idx] as string);
                    record = { ...record, ...parsed };
                  } catch (e) {
                    // 解析失败，保持原值
                  }
                } else {
                  record[col] = row[idx];
                }
              });
            } else {
              // 未知格式，尝试通用解析
              columns.forEach((col, idx) => {
                let value = row[idx];
                if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                  try {
                    value = JSON.parse(value);
                  } catch (e) {
                    // 保持原值
                  }
                }
                record[col] = value;
              });
            }
            
            // 确保必要的字段存在
            if (record.url) {
              await db.metadata.put(record);
              stats.metadata++;
            }
          }
        }
      } catch (e) {
        console.warn('导入 metadata 表失败:', e);
      }

      // 导入 resource 表
      try {
        const resourceResult = sqlDb.exec('SELECT * FROM resource');
        if (resourceResult.length > 0) {
          const columns = resourceResult[0].columns;
          const values = resourceResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  value = JSON.parse(value);
                } catch (e) {
                  // 保持原值
                }
              }
              record[col] = value;
            });
            await db.resource.put(record);
            stats.resource++;
          }
        }
      } catch (e) {
        console.warn('导入 resource 表失败:', e);
      }

      // 导入 resource-map 表
      try {
        const resourceMapResult = sqlDb.exec('SELECT * FROM "resource-map"');
        if (resourceMapResult.length > 0) {
          const columns = resourceMapResult[0].columns;
          const values = resourceMapResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  value = JSON.parse(value);
                } catch (e) {
                  // 保持原值
                }
              }
              record[col] = value;
            });
            await db['resource-map'].put(record);
            stats.resource_map++;
          }
        }
      } catch (e) {
        console.warn('导入 resource-map 表失败:', e);
      }

      // 导入 api 表
      try {
        const apiResult = sqlDb.exec('SELECT * FROM api');
        if (apiResult.length > 0) {
          const columns = apiResult[0].columns;
          const values = apiResult[0].values;
          
          for (const row of values) {
            const record: any = {};
            columns.forEach((col, idx) => {
              let value = row[idx];
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  value = JSON.parse(value);
                } catch (e) {
                  // 保持原值
                }
              }
              record[col] = value;
            });
            await db.api.put(record);
            stats.api++;
          }
        }
      } catch (e) {
        console.warn('导入 api 表失败:', e);
      }
    }
  );

  // 关闭数据库
  sqlDb.close();

  return stats;
}

/**
 * 从 Dexie 导出数据到 SQLite DB 文件
 * @returns Blob 对象，可以用于下载
 */
export async function exportToSqlite(): Promise<Blob> {
  const SQL = await initSql();
  
  // 创建新的 SQLite 数据库
  const sqlDb: Database = new SQL.Database();

  // 创建表结构
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS api (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      account TEXT,
      call_time INTEGER,
      data TEXT
    );
  `);

  // article 表包含文章基础信息和统计数据（阅读/点赞/分享/喜欢/留言数）
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS article (
      key TEXT PRIMARY KEY,
      fakeid TEXT,
      aid TEXT,
      album_id TEXT,
      appmsg_album_infos TEXT,
      appmsgid TEXT,
      checking_status INTEGER,
      copyright_stat INTEGER,
      copyright_type INTEGER,
      cover TEXT,
      create_time INTEGER,
      digest TEXT,
      has_red_packet_cover INTEGER,
      is_deleted INTEGER,
      item_show_type INTEGER,
      itemidx INTEGER,
      link TEXT,
      media_duration INTEGER,
      tagid TEXT,
      title TEXT,
      update_time INTEGER,
      readNum INTEGER DEFAULT 0,
      oldLikeNum INTEGER DEFAULT 0,
      shareNum INTEGER DEFAULT 0,
      likeNum INTEGER DEFAULT 0,
      commentNum INTEGER DEFAULT 0
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS asset (
      url TEXT PRIMARY KEY,
      file BLOB,
      fakeid TEXT
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS comment (
      url TEXT PRIMARY KEY,
      data TEXT,
      fakeid TEXT
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS comment_reply (
      key TEXT PRIMARY KEY,
      url TEXT,
      contentID TEXT,
      data TEXT,
      fakeid TEXT
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS debug (
      url TEXT PRIMARY KEY,
      data TEXT,
      fakeid TEXT
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS html (
      url TEXT PRIMARY KEY,
      data TEXT,
      fakeid TEXT
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS info (
      fakeid TEXT PRIMARY KEY,
      completed INTEGER,
      count INTEGER,
      articles INTEGER,
      nickname TEXT,
      round_head_img TEXT,
      total_count INTEGER,
      create_time INTEGER,
      update_time INTEGER,
      last_update_time INTEGER,
      readNum INTEGER DEFAULT 0,
      oldLikeNum INTEGER DEFAULT 0,
      shareNum INTEGER DEFAULT 0,
      likeNum INTEGER DEFAULT 0,
      commentNum INTEGER DEFAULT 0
    );
  `);

  // metadata 表结构优化：将统计字段独立存储，便于查询和分析
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      url TEXT PRIMARY KEY,
      fakeid TEXT,
      title TEXT,
      readNum INTEGER DEFAULT 0,
      oldLikeNum INTEGER DEFAULT 0,
      shareNum INTEGER DEFAULT 0,
      likeNum INTEGER DEFAULT 0,
      commentNum INTEGER DEFAULT 0
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS resource (
      url TEXT PRIMARY KEY,
      data TEXT,
      fakeid TEXT
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS "resource-map" (
      url TEXT PRIMARY KEY,
      data TEXT,
      fakeid TEXT
    );
  `);

  // 预取 metadata 统计数据（供 info/article/metadata 三处复用）
  const metadataData = await db.metadata.toArray();
  const metadataByUrl = new Map<string, any>();
  const metadataStatsByFakeid = new Map<
    string,
    {
      readNum: number;
      oldLikeNum: number;
      shareNum: number;
      likeNum: number;
      commentNum: number;
    }
  >();
  for (const metadata of metadataData) {
    if (metadata.url) {
      metadataByUrl.set(metadata.url, metadata);
    }
    if (metadata.fakeid) {
      const stats = metadataStatsByFakeid.get(metadata.fakeid) || {
        readNum: 0,
        oldLikeNum: 0,
        shareNum: 0,
        likeNum: 0,
        commentNum: 0,
      };
      stats.readNum += metadata.readNum || 0;
      stats.oldLikeNum += metadata.oldLikeNum || 0;
      stats.shareNum += metadata.shareNum || 0;
      stats.likeNum += metadata.likeNum || 0;
      stats.commentNum += metadata.commentNum || 0;
      metadataStatsByFakeid.set(metadata.fakeid, stats);
    }
  }

  // 导出 info 表数据（包含统计字段汇总）
  const infoData = await db.info.toArray();
  for (const record of infoData) {
    const stats = metadataStatsByFakeid.get(record.fakeid) || {
      readNum: 0,
      oldLikeNum: 0,
      shareNum: 0,
      likeNum: 0,
      commentNum: 0,
    };
    sqlDb.run(
      `INSERT INTO info (fakeid, completed, count, articles, nickname, round_head_img, total_count, create_time, update_time, last_update_time, readNum, oldLikeNum, shareNum, likeNum, commentNum) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.fakeid,
        record.completed ? 1 : 0,
        record.count,
        record.articles,
        record.nickname || null,
        record.round_head_img || null,
        record.total_count,
        record.create_time || null,
        record.update_time || null,
        record.last_update_time || null,
        stats.readNum,
        stats.oldLikeNum,
        stats.shareNum,
        stats.likeNum,
        stats.commentNum,
      ]
    );
  }

  // 导出 article 表数据（包含统计数据）
  const articleData = await db.article.toArray();
  for (const record of articleData) {
    const key = `${record.fakeid}:${record.aid}`;
    // 尝试从 metadata 获取统计数据（通过 link 关联）
    const metadata = record.link ? metadataByUrl.get(record.link) : null;
    
    sqlDb.run(
      `INSERT INTO article (key, fakeid, aid, album_id, appmsg_album_infos, appmsgid, checking_status, copyright_stat, copyright_type, cover, create_time, digest, has_red_packet_cover, is_deleted, item_show_type, itemidx, link, media_duration, tagid, title, update_time, readNum, oldLikeNum, shareNum, likeNum, commentNum) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        key,
        record.fakeid,
        record.aid,
        record.album_id || null,
        record.appmsg_album_infos ? JSON.stringify(record.appmsg_album_infos) : null,
        record.appmsgid || null,
        record.checking_status || null,
        record.copyright_stat || null,
        record.copyright_type || null,
        record.cover || null,
        record.create_time,
        record.digest || null,
        record.has_red_packet_cover || null,
        record.is_deleted || null,
        record.item_show_type || null,
        record.itemidx || null,
        record.link,
        record.media_duration || null,
        record.tagid ? JSON.stringify(record.tagid) : null,
        record.title,
        record.update_time || null,
        // 统计数据字段
        metadata?.readNum || 0,
        metadata?.oldLikeNum || 0,
        metadata?.shareNum || 0,
        metadata?.likeNum || 0,
        metadata?.commentNum || 0,
      ]
    );
  }

  // 导出 asset 表数据（跳过 file blob 字段，因为可能很大）
  // 如果需要导出 blob，需要特殊处理
  const assetData = await db.asset.toArray();
  for (const record of assetData) {
    try {
      const fileData = record.file ? await record.file.arrayBuffer() : null;
      sqlDb.run(
        `INSERT INTO asset (url, file, fakeid) VALUES (?, ?, ?)`,
        [record.url, fileData ? new Uint8Array(fileData) : null, record.fakeid]
      );
    } catch (e) {
      console.warn('导出 asset 失败:', record.url, e);
    }
  }

  // 导出 comment 表数据
  const commentData = await db.comment.toArray();
  for (const record of commentData) {
    sqlDb.run(
      `INSERT INTO comment (url, data, fakeid) VALUES (?, ?, ?)`,
      [record.url, JSON.stringify(record), record.fakeid]
    );
  }

  // 导出 comment_reply 表数据
  const commentReplyData = await db.comment_reply.toArray();
  for (const record of commentReplyData) {
    const key = `${record.url}:${record.contentID}`;
    sqlDb.run(
      `INSERT INTO comment_reply (key, url, contentID, data, fakeid) VALUES (?, ?, ?, ?, ?)`,
      [key, record.url, record.contentID, JSON.stringify(record), record.fakeid]
    );
  }

  // 导出 debug 表数据
  const debugData = await db.debug.toArray();
  for (const record of debugData) {
    sqlDb.run(
      `INSERT INTO debug (url, data, fakeid) VALUES (?, ?, ?)`,
      [record.url, JSON.stringify(record), record.fakeid]
    );
  }

  // 导出 html 表数据
  const htmlData = await db.html.toArray();
  for (const record of htmlData) {
    sqlDb.run(
      `INSERT INTO html (url, data, fakeid) VALUES (?, ?, ?)`,
      [record.url, JSON.stringify(record), record.fakeid]
    );
  }

  // 导出 metadata 表数据（各统计字段独立存储）
  for (const record of metadataData) {
    sqlDb.run(
      `INSERT INTO metadata (url, fakeid, title, readNum, oldLikeNum, shareNum, likeNum, commentNum) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.url,
        record.fakeid || null,
        record.title || null,
        record.readNum || 0,
        record.oldLikeNum || 0,
        record.shareNum || 0,
        record.likeNum || 0,
        record.commentNum || 0,
      ]
    );
  }

  // 导出 resource 表数据
  const resourceData = await db.resource.toArray();
  for (const record of resourceData) {
    sqlDb.run(
      `INSERT INTO resource (url, data, fakeid) VALUES (?, ?, ?)`,
      [record.url, JSON.stringify(record), record.fakeid]
    );
  }

  // 导出 resource-map 表数据
  const resourceMapData = await db['resource-map'].toArray();
  for (const record of resourceMapData) {
    sqlDb.run(
      `INSERT INTO "resource-map" (url, data, fakeid) VALUES (?, ?, ?)`,
      [record.url, JSON.stringify(record), record.fakeid]
    );
  }

  // 导出 api 表数据
  const apiData = await db.api.toArray();
  for (const record of apiData) {
    sqlDb.run(
      `INSERT INTO api (name, account, call_time, data) VALUES (?, ?, ?, ?)`,
      [record.name || null, record.account || null, record.call_time || null, JSON.stringify(record)]
    );
  }

  // 导出数据库为 Uint8Array
  const uint8Array = sqlDb.export();
  
  // 关闭数据库
  sqlDb.close();

  // 转换为 Blob
  return new Blob([uint8Array], { type: 'application/x-sqlite3' });
}

/**
 * 导出 metadata 数据为 CSV 格式
 * @returns Blob 对象，可以用于下载
 */
export async function exportMetadataToCsv(): Promise<Blob> {
  const metadataData = await db.metadata.toArray();
  
  // CSV 表头
  const headers = ['url', 'fakeid', 'title', 'readNum', 'oldLikeNum', 'shareNum', 'likeNum', 'commentNum'];
  
  // 转义 CSV 字段（处理逗号、引号、换行符）
  const escapeCSVField = (field: any): string => {
    if (field === null || field === undefined) {
      return '';
    }
    const str = String(field);
    // 如果包含逗号、引号或换行符，需要用引号包裹并转义内部引号
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  
  // 生成 CSV 内容
  const csvLines: string[] = [];
  
  // 添加表头
  csvLines.push(headers.join(','));
  
  // 添加数据行
  for (const record of metadataData) {
    const row = [
      escapeCSVField(record.url),
      escapeCSVField(record.fakeid),
      escapeCSVField(record.title),
      escapeCSVField(record.readNum || 0),
      escapeCSVField(record.oldLikeNum || 0),
      escapeCSVField(record.shareNum || 0),
      escapeCSVField(record.likeNum || 0),
      escapeCSVField(record.commentNum || 0),
    ];
    csvLines.push(row.join(','));
  }
  
  // 添加 BOM 以支持 Excel 正确识别 UTF-8
  const BOM = '\uFEFF';
  const csvContent = BOM + csvLines.join('\n');
  
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
}

/**
 * 从 CSV 文件导入 metadata 数据
 * @param file - CSV 文件
 * @returns 导入的记录数
 */
export async function importMetadataFromCsv(file: File): Promise<number> {
  const text = await file.text();
  
  // 移除可能存在的 BOM
  const content = text.replace(/^\uFEFF/, '');
  
  // 解析 CSV
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV 文件格式无效：至少需要表头和一行数据');
  }
  
  // 解析表头
  const headers = parseCSVLine(lines[0]);
  
  // 验证必要的字段
  if (!headers.includes('url')) {
    throw new Error('CSV 文件缺少必要的 url 字段');
  }
  
  let importCount = 0;
  
  await db.transaction('rw', 'metadata', async () => {
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      
      if (values.length !== headers.length) {
        console.warn(`第 ${i + 1} 行字段数量不匹配，跳过`);
        continue;
      }
      
      const record: any = {};
      headers.forEach((header, idx) => {
        let value: any = values[idx];
        
        // 数字字段转换
        if (['readNum', 'oldLikeNum', 'shareNum', 'likeNum', 'commentNum'].includes(header)) {
          value = parseInt(value, 10) || 0;
        }
        
        record[header] = value;
      });
      
      if (record.url) {
        await db.metadata.put(record);
        importCount++;
      }
    }
  });
  
  return importCount;
}

/**
 * 解析 CSV 行（处理引号包裹的字段）
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // 转义的引号
          current += '"';
          i++;
        } else {
          // 结束引号
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  // 添加最后一个字段
  result.push(current);
  
  return result;
}

/**
 * 导出 metadata 数据为 JSON 格式
 * @returns Blob 对象，可以用于下载
 */
export async function exportMetadataToJson(): Promise<Blob> {
  const metadataData = await db.metadata.toArray();
  
  // 格式化输出，便于阅读
  const jsonContent = JSON.stringify(metadataData, null, 2);
  
  return new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
}

/**
 * 从 JSON 文件导入 metadata 数据
 * @param file - JSON 文件
 * @returns 导入的记录数
 */
export async function importMetadataFromJson(file: File): Promise<number> {
  const text = await file.text();
  
  let data: any[];
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON 文件格式无效');
  }
  
  if (!Array.isArray(data)) {
    throw new Error('JSON 文件应为数组格式');
  }
  
  let importCount = 0;
  
  await db.transaction('rw', 'metadata', async () => {
    for (const record of data) {
      if (!record.url) {
        console.warn('记录缺少 url 字段，跳过');
        continue;
      }
      
      // 确保数字字段为数字类型
      const normalizedRecord = {
        url: record.url,
        fakeid: record.fakeid || '',
        title: record.title || '',
        readNum: parseInt(record.readNum, 10) || 0,
        oldLikeNum: parseInt(record.oldLikeNum, 10) || 0,
        shareNum: parseInt(record.shareNum, 10) || 0,
        likeNum: parseInt(record.likeNum, 10) || 0,
        commentNum: parseInt(record.commentNum, 10) || 0,
      };
      
      await db.metadata.put(normalizedRecord);
      importCount++;
    }
  });
  
  return importCount;
}

/**
 * 在应用启动时自动加载 DB 文件
 */
export async function autoLoadDatabase(): Promise<boolean> {
  try {
    // 尝试从服务器加载默认的备份数据库
    const response = await fetch('/data/wechat-backup-2025-11-12T06-46-03.db');
    if (!response.ok) {
      console.log('没有找到默认备份数据库文件');
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' });
    const file = new File([blob], 'wechat-backup-2025-11-12T06-46-03.db');

    // 检查 IndexedDB 是否已经有数据
    const infoCount = await db.info.count();
    if (infoCount > 0) {
      console.log('数据库已有数据，跳过自动加载');
      return false;
    }

    console.log('开始自动加载备份数据库...');
    const stats = await importFromSqlite(file);
    console.log('自动加载完成:', stats);
    return true;
  } catch (error) {
    console.error('自动加载数据库失败:', error);
    return false;
  }
}

