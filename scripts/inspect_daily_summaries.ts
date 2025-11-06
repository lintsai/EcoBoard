import pool from '../src/server/database/pool';

(async () => {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'daily_summaries'
      ORDER BY ordinal_position
    `);

    console.log('daily_summaries columns:');
    res.rows.forEach(r => console.log('-', r.column_name, r.data_type));
    process.exit(0);
  } catch (err) {
    console.error('Error querying information_schema:', err);
    process.exit(1);
  }
})();
