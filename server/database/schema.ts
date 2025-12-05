import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  fakeid: text('fakeid').primaryKey(),
  nickname: text('nickname'),
  alias: text('alias'),
  round_head_img: text('round_head_img'),
  service_type: integer('service_type'),
  signature: text('signature'),
  
  // Stats
  total_count: integer('total_count').default(0),
  
  // Timestamps
  create_time: integer('create_time'), // Added time
  update_time: integer('update_time'), // Last sync time
});

export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(), // fakeid + aid or just aid? aid is unique enough? Let's use link or combination. 
  // Looking at current `store/v2/article.ts`, it uses `fakeid:aid` as key. 
  // However, aid might be unique within a fakeid. 
  // Let's make a composite primary key or a generated one. 
  // Drizzle SQLite composite PK support: primaryKey({ columns: [table.fakeid, table.aid] })
  
  fakeid: text('fakeid').notNull().references(() => accounts.fakeid, { onDelete: 'cascade' }),
  aid: text('aid').notNull(),
  
  title: text('title'),
  digest: text('digest'),
  link: text('link'), // Url
  
  create_time: integer('create_time'),
  update_time: integer('update_time'),
  
  cover: text('cover'),
  itemidx: integer('itemidx'),
  appmsgid: integer('appmsgid'),
  album_id: text('album_id'),
  author_name: text('author_name'),
  
  is_deleted: integer('is_deleted', { mode: 'boolean' }).default(false),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.fakeid, table.aid] }),
  };
});
