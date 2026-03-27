const { Pool } = require('pg');

// PRO API: /api/export
// Streams the entire Kaspi Prices History as a raw text/csv blob.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Send as CSV Document
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kaspi_birds_analytics.csv"');

  const connectionString = process.env.birds_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).send("Database URL missing");
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const query = `
      SELECT ph.id, p.id as product_code, p.title, p.brand, ph.city, ph.price, ph.sales, TO_CHAR(ph.recorded_at, 'YYYY-MM-DD HH24:MI:SS') as date
      FROM prices_history ph
      JOIN products p ON ph.product_id = p.id
      ORDER BY ph.recorded_at DESC
    `;
    const result = await pool.query(query);
    
    let csv = "\uFEFFID,Product Code,Title,Brand,City (Zone),Price (KZT),Sales (RK),Date\n";
    
    result.rows.forEach(r => {
        // Sanitize title for CSV (escape double quotes, wrap in quotes)
        const safeTitle = r.title ? '"' + r.title.replace(/"/g, '""') + '"' : '""';
        const safeBrand = r.brand ? '"' + r.brand.replace(/"/g, '""') + '"' : '""';
        csv += `${r.id},${r.product_code},${safeTitle},${safeBrand},${r.city},${r.price},${r.sales !== null ? r.sales : ''},${r.date}\n`;
    });

    res.status(200).send(csv);
  } catch(e) {
    console.error("CSV Export Failed", e);
    res.status(500).send("Export failed: " + e.message);
  } finally {
    pool.end();
  }
};
