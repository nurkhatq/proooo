const { Pool } = require('pg');

// PRO API: /api/trends
// Exposes the price_history grouped by period (day, week, month)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');

  const period = req.query.period || 'day'; // day, week, month
  
  let dateTrunc = 'day';
  if (period === 'week') dateTrunc = 'week';
  if (period === 'month') dateTrunc = 'month';

  if (!process.env.birds_DATABASE_URL) {
    return res.status(500).json({ error: "Database URL missing" });
  }

  const pool = new Pool({
    connectionString: process.env.birds_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const query = `
      SELECT 
        p.id, p.title, p.brand, p.image, p.rating, p.reviews_quantity,
        (
          SELECT json_agg(json_build_object(
            'city', ph.city, 
            'price', ph.price, 
            'sales', ph.sales,
            'date', TO_CHAR(ph.recorded_at, 'YYYY-MM-DD')
          ))
          FROM (
             -- Aggregate by user-selected period (day/week/month) using average price
             SELECT city, ROUND(AVG(price)) as price, MAX(sales) as sales, date_trunc($1, recorded_at) as recorded_at
             FROM prices_history
             WHERE product_id = p.id
             GROUP BY city, date_trunc($1, recorded_at)
             ORDER BY city, recorded_at DESC
          ) ph
        ) as price_records
      FROM products p
      ORDER BY p.last_seen DESC
    `;

    const result = await pool.query(query, [dateTrunc]);

    const formattedData = result.rows.map(row => {
      const prices = {};
      const history = {};
      let latestSales = null;

      if (row.price_records) {
        row.price_records.forEach(record => {
          if (!prices[record.city]) { prices[record.city] = record.price; }
          if (record.sales !== null && latestSales === null) { latestSales = record.sales; }
          
          if (!history[record.city]) history[record.city] = [];
          history[record.city].push({ date: record.date, price: record.price, sales: record.sales });
        });
      }

      return {
        id: row.id, title: row.title, brand: row.brand, image: row.image,
        rating: row.rating, reviewsQuantity: row.reviews_quantity, salesCount: latestSales,
        prices: prices, history: history
      };
    });

    res.status(200).json(formattedData);
  } catch(e) {
    res.status(500).json({ error: e.message });
  } finally {
    pool.end();
  }
};
