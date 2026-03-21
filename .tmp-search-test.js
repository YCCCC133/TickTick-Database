require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const search = process.argv[2] || 'sig';
const SEARCH_NORMALIZE_PATTERN = /[\s\p{P}\p{S}]+/gu;
function normalizeSearchText(value) {
  return value.toLowerCase().replace(SEARCH_NORMALIZE_PATTERN, '').trim();
}
function buildSearchVariants(search) {
  const normalized = normalizeSearchText(search);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  const rawChunks = search.split(/[\s\p{P}\p{S}]+/gu).map((part) => normalizeSearchText(part)).filter(Boolean);
  rawChunks.forEach((chunk) => variants.add(chunk));
  const base = rawChunks.join('') || normalized;
  if (base.length >= 2) for (let i = 0; i < base.length - 1; i += 1) variants.add(base.slice(i, i + 2));
  if (base.length >= 3) for (let i = 0; i < base.length - 2; i += 1) variants.add(base.slice(i, i + 3));
  return Array.from(variants).filter((variant) => variant.length > 0).slice(0, 16);
}
function buildNormalizedTextSql(column) {
  return `regexp_replace(lower(coalesce(${column}, '')), '[^0-9a-zA-Z一-龥]+', '', 'g')`;
}
function buildSearchScoreSql(variants, startIndex) {
  const parts = [];
  const normTitle = buildNormalizedTextSql('f.title');
  const normFileName = buildNormalizedTextSql('f.file_name');
  const normCourse = buildNormalizedTextSql('f.course');
  const normDescription = buildNormalizedTextSql('f.description');
  const normCategory = buildNormalizedTextSql("coalesce(c.name, '')");
  variants.forEach((variant, index) => {
    const paramIndex = startIndex + index;
    const lengthWeight = Math.max(6, Math.min(18, variant.length * 3));
    parts.push(`(
      CASE WHEN ${normTitle} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 6} ELSE 0 END +
      CASE WHEN ${normFileName} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 5} ELSE 0 END +
      CASE WHEN ${normCourse} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 3} ELSE 0 END +
      CASE WHEN ${normDescription} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 2} ELSE 0 END +
      CASE WHEN ${normCategory} LIKE '%' || $${paramIndex} || '%' THEN ${lengthWeight * 3} ELSE 0 END
    )`);
  });
  return parts.length > 0 ? parts.join(' + ') : '0';
}
(async () => {
  const searchVariants = buildSearchVariants(search);
  const params = [];
  const where = [];
  let idx = 1;
  const searchStartIndex = idx;
  if (searchVariants.length > 0) {
    const normTitle = buildNormalizedTextSql('f.title');
    const normFileName = buildNormalizedTextSql('f.file_name');
    const normCourse = buildNormalizedTextSql('f.course');
    const normDescription = buildNormalizedTextSql('f.description');
    const normCategory = buildNormalizedTextSql("coalesce(c.name, '')");
    const searchClauses = [];
    for (const variant of searchVariants) {
      searchClauses.push(`(
        ${normTitle} LIKE '%' || $${idx} || '%' OR
        ${normFileName} LIKE '%' || $${idx} || '%' OR
        ${normCourse} LIKE '%' || $${idx} || '%' OR
        ${normDescription} LIKE '%' || $${idx} || '%' OR
        ${normCategory} LIKE '%' || $${idx} || '%'
      )`);
      params.push(variant);
      idx += 1;
    }
    where.push(`(${searchClauses.join(' OR ')})`);
  }
  const whereSql = where.length > 0 ? where.join(' and ') : 'true';
  const sortBy = 'created_at';
  const sortOrder = 'desc';
  const sortMap = { created_at: 'created_at', download_count: 'download_count', average_rating: 'average_rating::numeric', title: 'title' };
  const sortColumn = sortMap[sortBy] || 'created_at';
  const orderBy = `${sortColumn} ${sortOrder === 'asc' ? 'asc' : 'desc'}`;
  const scoreSql = searchVariants.length > 0 ? buildSearchScoreSql(searchVariants, searchStartIndex) : '0';
  const dataParams = [...params, 20, 0];
  const sql = `with ranked as (
    select
      f.*,
      c.name as category_name,
      p.name as uploader_name,
      p.email as uploader_email,
      p.avatar as uploader_avatar,
      p.real_name as uploader_real_name,
      p.student_id as uploader_student_id,
      coalesce(cc.comment_count, 0)::int as comment_count,
      ${scoreSql} as relevance_score
    from files f
    left join categories c on c.id = f.category_id
    left join profiles p on p.user_id = f.uploader_id
    left join (
      select file_id, count(*)::int as comment_count
      from comments
      where is_active = true
      group by file_id
    ) cc on cc.file_id = f.id
    where ${whereSql}
  )
  select * from ranked
  order by ${searchVariants.length > 0 ? 'relevance_score desc, ' : ''}${orderBy}
  limit $${idx} offset $${idx + 1}`;
  console.log({ searchVariants, dataParams });
  const client = await pool.connect();
  try {
    const res = await client.query(sql, dataParams);
    console.log('rowCount', res.rowCount);
    console.log(res.rows.slice(0, 5).map((row) => ({ title: row.title, file_name: row.file_name, score: row.relevance_score })));
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    process.exit();
  }
})();
