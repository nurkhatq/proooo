const { Pool } = require('pg');

// PRO API: /api/darkstores
// Returns per-zone availability matrix showing which warehouses are missing SKUs

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');

  const connectionString = process.env.birds_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "Database URL missing" });
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    // 1. Per-zone missing items (from zone_availability) — primary source
    const zoneQuery = `
      SELECT p.id, p.title, p.brand, z.city, z.zone_id, z.recorded_at
      FROM products p
      JOIN (
         SELECT DISTINCT ON (product_id, city, zone_id)
           product_id, city, zone_id, is_available, recorded_at
         FROM zone_availability
         ORDER BY product_id, city, zone_id, recorded_at DESC
      ) z ON p.id = z.product_id
      WHERE z.is_available = false
      ORDER BY z.recorded_at DESC
      LIMIT 200
    `;
    const zoneResult = await pool.query(zoneQuery);

    // Group by zone_id
    const byZone = {};
    zoneResult.rows.forEach(r => {
      const key = `${r.city} — ${r.zone_id}`;
      if (!byZone[key]) byZone[key] = [];
      byZone[key].push({ id: r.id, title: r.title, brand: r.brand, since: r.recorded_at });
    });

    // 2. Also include city-level out-of-stock (legacy fallback if zone data is empty)
    if (Object.keys(byZone).length === 0) {
      const cityQuery = `
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
      const cityResult = await pool.query(cityQuery);
      cityResult.rows.forEach(r => {
        if (!byZone[r.darkstore_zone]) byZone[r.darkstore_zone] = [];
        byZone[r.darkstore_zone].push({ id: r.id, title: r.title, brand: r.brand, since: r.vanished_since });
      });
    }

    // 3. Zone summary stats
    const statsQuery = `
      SELECT zone_id, city,
        COUNT(*) FILTER (WHERE is_available = false) as out_of_stock,
        COUNT(DISTINCT product_id) as total_tracked,
        MAX(recorded_at) as last_check
      FROM (
        SELECT DISTINCT ON (product_id, city, zone_id)
          product_id, city, zone_id, is_available, recorded_at
        FROM zone_availability
        ORDER BY product_id, city, zone_id, recorded_at DESC
      ) latest
      GROUP BY zone_id, city
      ORDER BY city, zone_id
    `;
    const statsResult = await pool.query(statsQuery);

    res.status(200).json({
      missing: byZone,
      zoneStats: statsResult.rows
    });

  } catch(e) {
    res.status(500).json({ error: e.message });
  } finally {
    pool.end();
  }
};
