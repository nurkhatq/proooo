const { Pool } = require('pg');

// PRO API: /api/darkstores
// Returns the missing assortment matrix, calculating which SKUs are physically missing from contiguous darkstore shelves

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');

  const connectionString = process.env.birds_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "Database URL missing" });
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // We want to detect completely missing SKUs by locating products whose LATEST (most recent) darkstore_availability entry is FALSE.
    const query = `
      SELECT p.id, p.title, p.brand, d.city as darkstore_zone, d.recorded_at as vanished_since
      FROM products p
      JOIN (
         SELECT DISTINCT ON (product_id, city) product_id, city, is_available, recorded_at
         FROM darkstore_availability
         ORDER BY product_id, city, recorded_at DESC
      ) d ON p.id = d.product_id
      WHERE d.is_available = false
      ORDER BY d.recorded_at DESC
    `;
    const result = await pool.query(query);
    
    // Group them logically for the frontend table
    const absentMap = {};
    result.rows.forEach(r => {
        if (!absentMap[r.darkstore_zone]) absentMap[r.darkstore_zone] = [];
        absentMap[r.darkstore_zone].push({
            id: r.id, title: r.title, brand: r.brand, since: r.vanished_since
        });
    });

    res.status(200).json(absentMap);
  } catch(e) {
    res.status(500).json({ error: e.message });
  } finally {
    pool.end();
  }
};
