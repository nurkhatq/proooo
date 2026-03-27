const https = require('https');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Pro Telegram Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8452017277:AAF08VRtTGyaNe5XKp5Ny_s0VsmAeLSYoBc';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1077964079';

const cityCodesPath = path.join(__dirname, 'cities.json');
let CITIES = JSON.parse(fs.readFileSync(cityCodesPath, 'utf8'));

const FAST_DEMO_MODE = true; 
const DEMO_CITIES = [
  'ALMATY', 'ASTANA', 'ZHIBEK_ZHOLY', 'BESAGASH', 'TUZDYBASTAY', 
  'GULDALA', 'KOSSHY', 'KASKELEN', 'IRGELI', 'ABAI', 
  'KARAGANDA', 'SHYMKENT', 'AKTOBE'
];

if (FAST_DEMO_MODE) {
  CITIES = CITIES.filter(c => DEMO_CITIES.includes(c.name));
  console.log(`🚀 DEMO MODE ACTIVE: Enabled ${CITIES.length} Top Cities only.`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const CITY_ZONE_MAP = {
  '750000000': 'Magnum_ZONE1', 
  '710000000': 'Magnum_ZONE5', 
};

function getZone(cityCode) {
  return CITY_ZONE_MAP[cityCode] || cityCode;
}

function getHeaders(cityCode, referer) {
  return {
    'Accept': 'application/json, text/*',
    'Accept-Language': 'ru,en;q=0.9,kk;q=0.8,ky;q=0.7',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Cookie': `kaspi.storefront.cookie.city=${cityCode};`,
    'Pragma': 'no-cache',
    'Referer': referer,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 YaBrowser/26.3.0.0 Safari/537.36',
    'X-Description-Enabled': 'true',
    'X-KS-City': cityCode,
    'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "YaBrowser";v="26.3", "Yowser";v="2.5"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  };
}

function httpGet(url, headers) {
  return new Promise(resolve => {
    const req = https.get(url, { headers, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function sendTelegramAlert(message) {
  return new Promise(resolve => {
     if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return resolve(false);
     const msg = encodeURIComponent(message);
     const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${msg}&parse_mode=Markdown`;
     https.get(url, res => {
         let d = ''; res.on('data', chunk => d+=chunk);
         res.on('end', () => resolve(true));
     });
  });
}

async function scrapeCity(city) {
  const cityCode = city.code;
  const zone = getZone(cityCode);
  const allCards = [];
  const seenIds = new Set();

  const filtersUrl = `https://kaspi.kz/yml/product-view/pl/filters?q=%3AavailableInZones%3A${zone}%3Acategory%3Ameat%20poultry&text&all=false&sort=relevance&ui=d&i=-1&c=${cityCode}`;
  const filtersRef = `https://kaspi.kz/shop/c/meat%20poultry/?q=%3AavailableInZones%3A${zone}%3Acategory%3Ameat%20poultry&sort=relevance&sc=`;

  const filtersResp = await httpGet(filtersUrl, getHeaders(cityCode, filtersRef));

  if (!filtersResp?.data) {
    console.log(`  -> [${city.name}] filters blocked or null.`);
    return [];
  }

  const queryID = filtersResp.data?.externalSearchQueryInfo?.queryID || '';
  const total = filtersResp.data?.total || 0;
  const page0cards = filtersResp.data?.cards || [];

  for (const card of page0cards) {
    if (!seenIds.has(card.id)) { seenIds.add(card.id); allCards.push(card); }
  }

  let page = 1;
  while (true) {
    await sleep(900);
    const referer = page === 1
      ? `https://kaspi.kz/shop/c/meat%20poultry/?q=%3AavailableInZones%3A${zone}%3Acategory%3Ameat%20poultry&sort=relevance&sc=`
      : `https://kaspi.kz/shop/c/meat%20poultry/?q=%3AavailableInZones%3A${zone}%3Acategory%3Ameat%20poultry&sort=relevance&sc&page=${page}`;

    const url = `https://kaspi.kz/yml/product-view/pl/results?page=${page}&q=%3Acategory%3Ameat%20poultry%3AavailableInZones%3A${zone}&text&sort=relevance&qs&requestId=${queryID}&ui=d&i=-1&c=${cityCode}`;

    const resp = await httpGet(url, getHeaders(cityCode, referer));
    const cards = Array.isArray(resp?.data) ? resp.data : [];

    if (cards.length === 0) break;
    
    let newCount = 0;
    for (const card of cards) {
      if (!seenIds.has(card.id)) { seenIds.add(card.id); allCards.push(card); newCount++; }
    }
    page++;
  }

  console.log(`  -> [${city.name}] Done: ${allCards.length} unique items`);
  return allCards;
}

const KASPI_COOKIE = process.env.KASPI_COOKIE || 'ks.tg=18; _ga=GA1.1.1255149933.1756273019; _hjSessionUser_283363=eyJpZCI6ImY1NzNlMWQ2LTU5ODktNWNhZC05MzAxLWYzMThjMGUxNDQxMiIsImNyZWF0ZWQiOjE3NTkyOTQzMzE5NDUsImV4aXN0aW5nIjp0cnVlfQ==; _ym_uid=1760015859264523590; _ym_d=1760015859; k_stat=0e86efa6-f141-4021-a86a-df5885eb59e3; _clck=1j15xrf%5E2%5Eg44%5E0%5E2208; kaspi.storefront.cookie.city=750000000';

function fetchOffers(sku, cityCode) {
  const zone = getZone(cityCode);
  const dynamicCookie = KASPI_COOKIE.replace(/cookie\.city=\d+/, `cookie.city=${cityCode}`);
  const payload = JSON.stringify({
      cityId: cityCode,
      id: sku,
      merchantUID: [],
      limit: 5,
      page: 0,
      product: { brand: '', categoryCodes: ['meat poultry'], baseProductCodes: [], groups: null, productSeries: [] },
      sortOption: 'PRICE',
      highRating: null,
      searchText: null,
      isExcellentMerchant: false,
      zoneId: [zone], 
      installationId: '-1'
  });
  
  const options = {
    hostname: 'kaspi.kz',
    path: `/yml/offer-view/offers/${sku}`,
    method: 'POST',
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/*',
        'Cookie': dynamicCookie,
        'X-KS-City': cityCode,
        'Referer': `https://kaspi.kz/shop/p/product-${sku}/?c=${cityCode}`,
        'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise(resolve => {
     const req = https.request(options, res => {
         let data = '';
         res.on('data', c => data += c);
         res.on('end', () => {
             try {
                const parsed = JSON.parse(data);
                resolve(parsed?.offers || []);
             } catch(e) { resolve([]); }
         });
     });
     req.on('timeout', () => { req.destroy(); resolve([]); });
     req.on('error', () => resolve([]));
     req.write(payload);
     req.end();
  });
}

async function main() {
  const connectionString = process.env.birds_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("✅ PRO Database Connected.");
  } catch(e) {
    console.error("❌ DB connection failed:", e.message);
    process.exit(1);
  }

  // 1. Fetch Previous State for Darkstores & Alerts
  const dbProducts = {}; 
  const dbPrices = {};
  try {
     const { rows: historyRows } = await client.query('SELECT DISTINCT product_id, city FROM prices_history');
     historyRows.forEach(r => {
        if (!dbProducts[r.city]) dbProducts[r.city] = new Set();
        dbProducts[r.city].add(r.product_id);
     });

     const { rows: latestPrices } = await client.query('SELECT DISTINCT ON (product_id, city) product_id, city, price FROM prices_history ORDER BY product_id, city, recorded_at DESC');
     latestPrices.forEach(r => {
        dbPrices[`${r.product_id}_${r.city}`] = r.price;
     });
  } catch(e) {
     console.log("⚠️ Could not fetch baseline history. Assuming empty database...");
  }

  const products = {};
  const currentZoneIds = {}; // Track what was scraped per zone, with stock status

  // 2. SCRAPE CITIES (Darkstore Check Layer)
  for (const city of CITIES) {
    console.log(`\n[${city.name}] Starting scrape...`);
    const cards = await scrapeCity(city);
    currentZoneIds[city.name] = {}; // Map of id -> stock (true/false)

    for (const card of cards) {
      const inStock = card.stock !== undefined ? card.stock > 0 : true; // Use real stock field!
      currentZoneIds[city.name][card.id] = inStock;
      if (!products[card.id]) {
        products[card.id] = {
          id: card.id, title: card.title, brand: card.brand || '',
          image: card.previewImages?.[0]?.medium || card.previewImages?.[0]?.large || '',
          rating: card.rating || 0, reviewsQuantity: card.reviewsQuantity || 0,
          prices: {}
        };
      }
      if (inStock) products[card.id].prices[city.name] = card.unitPrice;
    }
    await sleep(2000);
  }

  const resultList = Object.values(products);
  if (resultList.length === 0) {
    console.error('\nZero products found. No database changes.');
    process.exit(1);
  }

  // 4. SALES TELEMETRY
  console.log(`\nFound ${resultList.length} unique products. Fetching global sales volume...`);
  for (let i = 0; i < resultList.length; i++) {
    const p = resultList[i];
    const availableCities = Object.keys(p.prices);
    if (availableCities.length > 0) {
      const firstCity = CITIES.find(c => c.name === availableCities[0]);
      const cityCode = firstCity ? firstCity.code : '750000000';
      const offers = await fetchOffers(p.id, cityCode);
      if (offers && offers.length > 0) {
        p.sales = offers[0].purchaseCount !== undefined ? offers[0].purchaseCount : null;
      } else { p.sales = null; }
    } else { p.sales = null; }
    
    if ((i + 1) % 10 === 0) console.log(`  -> Fetched sales for ${i + 1}/${resultList.length} items`);
    await sleep(350); 
  }

  // 5. PRICE ALERTS & DB INGESTION
  console.log(`\nPushing to Neon Postgres & Firing Alerts...`);
  
  let priceRowsInserted = 0;
  let alertsSent = 0;

  for (const product of resultList) {
    await client.query(`
      INSERT INTO products (id, title, brand, image, rating, reviews_quantity)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET 
        title = EXCLUDED.title, image = EXCLUDED.image, rating = EXCLUDED.rating, last_seen = CURRENT_TIMESTAMP
    `, [product.id, product.title, product.brand, product.image, product.rating, product.reviewsQuantity]);

    for (const [cityName, price] of Object.entries(product.prices)) {
      // Alert Check
      const oldPrice = dbPrices[`${product.id}_${cityName}`];
      if (oldPrice && oldPrice !== price) {
          const type = price > oldPrice ? "📈 ПОВЫСИЛАСЬ" : "📉 СНИЗИЛАСЬ";
          const alertMsg = `💰 **АЛЕРТ ЦЕНЫ: ${type}**\n\n🐔 **Товар:** ${product.title}\n🛒 **Бренд:** ${product.brand || 'Без бренда'}\n📍 **Город (Зона):** ${cityName}\n\n💵 Старая цена: ${oldPrice} ₸\n💵 Новая цена: ${price} ₸\n🔢 ID: ${product.id}`;
          
          await sendTelegramAlert(alertMsg);
          await client.query(`
            INSERT INTO price_alerts (product_id, city, old_price, new_price, alert_type)
            VALUES ($1, $2, $3, $4, $5)
          `, [product.id, cityName, oldPrice, price, price > oldPrice ? 'INCREASE' : 'DECREASE']);
          alertsSent++;
      }

      await client.query(`
        INSERT INTO prices_history (product_id, city, price, sales)
        VALUES ($1, $2, $3, $4)
      `, [product.id, cityName, price, product.sales]);
      priceRowsInserted++;
    }
  }

  // 6. DARKSTORE TRACKING (uses real stock field per card)
  console.log(`\n🕵️‍♂️ Running Matrix Darkstore Checks...`);
  let outOfStockCount = 0;
  for (const city of CITIES) {
      const currentStockMap = currentZoneIds[city.name] || {}; // id -> bool
      const currentIds = Object.keys(currentStockMap);
      const historicalIdsForCity = dbProducts[city.name] || new Set();

      // Log stock status for all scrapped items (using real stock field)
      for (const [cardId, isAvailable] of Object.entries(currentStockMap)) {
          await client.query(`
            INSERT INTO darkstore_availability (product_id, city, is_available)
            VALUES ($1, $2, $3)
          `, [cardId, city.name, isAvailable]);
          if (!isAvailable) outOfStockCount++;
      }
      // Also log items that were in DB but disappeared from search entirely
      for (const hid of historicalIdsForCity) {
          if (!currentStockMap.hasOwnProperty(hid)) {
              await client.query(`
                INSERT INTO darkstore_availability (product_id, city, is_available)
                VALUES ($1, $2, $3)
              `, [hid, city.name, false]);
              outOfStockCount++;
          }
      }
  }
  console.log(`   -> Found ${outOfStockCount} out-of-stock/missing SKUs across all zones.`);

  console.log(`✅ Success! Updated ${resultList.length} items & ${priceRowsInserted} prices. Fired ${alertsSent} alerts.`);
  await client.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
