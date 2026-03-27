/**
 * RESEARCH: Kaspi Darkstore Zone Structure
 * Goal: Map all unique zone IDs per city and understand per-warehouse availability
 */
const https = require('https');

function httpGet(url, headers) {
  return new Promise(resolve => {
    const req = https.get(url, { headers, timeout: 15000 }, res => {
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

// Test multiple cities & zones
const TEST_CASES = [
  { city: 'ALMATY',      code: '750000000', zone: 'Magnum_ZONE1' },
  { city: 'ASTANA',      code: '710000000', zone: 'Magnum_ZONE5' },
  { city: 'ZHIBEK_ZHOLY', code: '113433100', zone: '113433100' },
  { city: 'BESAGASH',    code: '196243100', zone: '196243100' },
];

async function fetchZones(cityCode, zone) {
  const headers = {
    'Accept': 'application/json, text/*',
    'Cookie': `kaspi.storefront.cookie.city=${cityCode};`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-KS-City': cityCode,
    'Referer': 'https://kaspi.kz/shop/c/meat%20poultry/',
  };
  const url = `https://kaspi.kz/yml/product-view/pl/filters?q=%3AavailableInZones%3A${zone}%3Acategory%3Ameat%20poultry&text&all=false&sort=relevance&ui=d&i=-1&c=${cityCode}`;
  return httpGet(url, headers);
}

async function main() {
  const results = {};

  for (const tc of TEST_CASES) {
    console.log(`\n--- Testing ${tc.city} (zone: ${tc.zone}) ---`);
    const resp = await fetchZones(tc.code, tc.zone);

    if (!resp?.data) { console.log('BLOCKED'); continue; }

    const cards = resp.data.cards || [];
    console.log(`Cards returned: ${cards.length}`);

    // Collect all unique zones FROM the card responses
    const allDeliveryZones = new Set();
    const outOfStock = [];
    
    cards.forEach(c => {
      (c.deliveryZones || []).forEach(z => allDeliveryZones.add(z));
      if (c.stock === 0) outOfStock.push({ id: c.id, title: c.title });
    });

    console.log(`Unique deliveryZones WITHIN results: ${[...allDeliveryZones].join(', ')}`);
    console.log(`Out of stock (stock=0): ${outOfStock.length} items`);
    if (outOfStock.length > 0) {
      outOfStock.slice(0, 3).forEach(p => console.log(`  - ${p.id}: ${p.title}`));
    }

    results[tc.city] = {
      zone: tc.zone,
      cardCount: cards.length,
      deliveryZones: [...allDeliveryZones],
      outOfStockCount: outOfStock.length,
    };

    // Show first card's full zone breakdown
    if (cards[0]) {
      const c = cards[0];
      console.log(`\nSample card: "${c.title}"`);
      console.log(`  stock: ${c.stock}`);
      console.log(`  deliveryZones: ${JSON.stringify(c.deliveryZones)}`);
      console.log(`  stickers: ${JSON.stringify(c.stickers)}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n\n=== RESEARCH SUMMARY ===');
  Object.entries(results).forEach(([city, data]) => {
    console.log(`\n${city} (queried zone: ${data.zone}):`);
    console.log(`  Cards: ${data.cardCount}`);
    console.log(`  All deliveryZones seen: ${data.deliveryZones.join(', ')}`);
    console.log(`  Out of stock: ${data.outOfStockCount}`);
  });

  console.log('\n\n=== KEY INSIGHT ===');
  console.log(`
Finding: When querying with availableInZones=ZONE_X, the API returns cards 
that have that zone in their deliveryZones array. 

A product can belong to multiple zones simultaneously (e.g., ZONE1, ZONE2, ZONE8).
This means ZONES = individual darkstore/warehouse locations within a city.

To track per-warehouse: query each zone independently as the "availableInZones" filter.
Known zones for Almaty so far: Magnum_ZONE1, Magnum_ZONE2, Magnum_ZONE8, Magnum_ZONE16, magnum_f_zone
`);
}

main().catch(console.error);
