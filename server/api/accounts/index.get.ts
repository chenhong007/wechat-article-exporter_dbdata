import { db } from '~/server/utils/db';
import { accounts } from '~/server/database/schema';
import { desc, like, count } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const size = Number(query.size) || 20;
  const keyword = query.keyword as string;

  const offset = (page - 1) * size;

  let whereClause = undefined;
  if (keyword) {
    whereClause = like(accounts.nickname, `%${keyword}%`);
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(accounts)
    .where(whereClause);
    
  const list = await db
    .select()
    .from(accounts)
    .where(whereClause)
    .limit(size)
    .offset(offset)
    .orderBy(desc(accounts.updated_at));

  return {
    success: true,
    total: totalResult.count,
    list,
    page,
    size,
  };
});

