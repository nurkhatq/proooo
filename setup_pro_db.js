const { Client } = require('pg');

const connectionString = process.env.birds_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERROR: DATABASE_URL environment variable is missing.");
  console.error("Please run: $env:birds_DATABASE_URL='postgres://...' node setup_pro_db.js");
  process.exit(1);
}

const client = new Client({ connectionString });

async function setupDatabase() {
  try {
    await client.connect();
    console.log("✅ Conntected to Neon PostgreSQL (PRO Environment)");

    // Base MVP Tables (Ensure they exist on fresh servers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        brand VARCHAR(100),
        image TEXT,
        rating FLOAT,
        reviews_quantity INT,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS prices_history (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(50) REFERENCES products(id) ON DELETE CASCADE,
        city VARCHAR(100) NOT NULL,
        price INT NOT NULL,
        sales INT,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prices_prod_city ON prices_history (product_id, city);`);
    console.log("✅ Core Tables 'products' and 'prices_history' are ready.");

    // Table 1: Darkstore Availability (Logs contiguous missing states per SKU per city)
    await client.query(`
      CREATE TABLE IF NOT EXISTS darkstore_availability (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(50) REFERENCES products(id) ON DELETE CASCADE,
        city VARCHAR(100) NOT NULL,
        is_available BOOLEAN NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_darkstore_prod_city ON darkstore_availability(product_id, city);
    `);
    console.log("✅ Table 'darkstore_availability' is ready.");

    // Table 2: Price Alerts (Logs triggers to prevent Telegram spam loops)
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(50) REFERENCES products(id) ON DELETE CASCADE,
        city VARCHAR(100) NOT NULL,
        old_price INT NOT NULL,
        new_price INT NOT NULL,
        alert_type VARCHAR(50) NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_alerts_prod_city ON price_alerts(product_id, city);
    `);
    console.log("✅ Table 'price_alerts' is ready.");

    console.log("\n🎉 PRO Database setup complete.");

  } catch (err) {
    console.error("❌ PRO Database setup failed:", err);
  } finally {
    await client.end();
  }
}

setupDatabase();
