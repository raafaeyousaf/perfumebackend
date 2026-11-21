import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'raafae',
  database: process.env.POSTGRES_DB || 'theperfumestory',
});

// Curated high quality bottle images
const perfumeImages = [
  'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1582211594533-268f4f1edcb9?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1563178406-4cdc2923acbc?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=700&q=80',
];

const lifestyleImages = [
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?auto=format&fit=crop&w=700&q=80',
];

// Names Generator by category
const menNameRoots = [
  'Venustas', 'Unknown Valley', 'Birth Place Rome', 'Utopia', 'Venustas Overdose', 'Holo Moana',
  'Bluez', 'Imaginor', 'Imperial Saffron', 'Cedrat Intense', 'Santal Sovereign', 'Oud Noir',
  'Veloce Royale', 'Apex Monarch', 'Canyon Breeze', 'Shadow Leather', 'Tuscan Knight', 'Azure Coast',
  'Silver Mountain Wood', 'Tobacco Dynasty', 'Titanium Vetiver', 'Obsidian Musk', 'Atlas Cedar',
  'Nomad Heritage', 'Stallion Gold', 'Midnight Amber', 'Glacier Pour Homme', 'Falcon Creed',
  'Dark Patchouli', 'Royal Mirage', 'Spartan Wood', 'Aether Storm', 'Cobalt Marine', 'Bravado',
  'Valor Absolute', 'Sultan Wood', 'Iron Amber', 'Balkan Citrus', 'Granite Mist', 'Vanguard'
];

const womenNameRoots = [
  'Lost In Love', 'La Belle Fleur', 'Silk Amber', 'Rose Velour', 'Golden Nectar', 'Velvet Blossom',
  'Cashmere Petals', 'Jasmine Sublime', 'Vanilla Royale', 'Orchid Nocturne', 'Blush Peony',
  'Magnolia Whisper', 'Dahlia Gold', 'Celestial Rose', 'Goddess Elixir', 'Opal Musk',
  'Pink Suede', 'Secret Garden', 'Enchanted Lily', 'Sweet Seduction', 'Moonlit Gardenia',
  'Aura Bella', 'Imperial Tuberose', 'Amber Silk Dew', 'Scarlet Velvet', 'Fleur de Soie',
  'Lotus Harmony', 'Prima Donna', 'Sweet Macaron', 'Ivory Bloom', 'Princess Sillage',
  'Damascena Gold', 'Mystic Praline', 'Elysian Petals', 'Chiffon Amber', 'Rosette Imperial',
  'Ambery Blush', 'Bella Luna', 'Serenade Pour Femme', 'Opulence Rose'
];

const unisexNameRoots = [
  'Noble Rouge', 'Angels Cut', 'Dark Orchid', 'Lazur', 'Deep Moss', 'Gris Imperial',
  'Santaleum 33', 'Baccarat Essence', 'Rouge Absolu', 'Oud Blanc', 'Tobacco Honey',
  'Amber Sultan', 'Smoky Vanilla', 'Bois de Cacao', 'Velvet Tonka', 'Incense Royale',
  'Cardamom Gold', 'Saffron Mirage', 'Silver Bergamot', 'Mineral Breeze', 'Leather & Rose',
  'Ambergris Pure', 'Oud Wood Intense', 'Cashmeran Velvet', 'Myrrh Sovereign', 'Arabian Cedar',
  'White Truffle Musk', 'Tea & Fig', 'Palo Santo Pure', 'Cinnamon Bark Extrait', 'Musk Al Safi',
  'Golden Cypress', 'Dark Iris', 'Solar Vetiver', 'Enigma Wood', 'Astral Cedar',
  'Gilded Oud', 'Amber Nectar Extrait', 'Obsidian Iris', 'Crown Elixir'
];

const exclusiveNameRoots = [
  'Supreme Oud Royale', 'Celestial Nova', 'Finer Designer 01', 'Oud Wood Heritage',
  'Private Reserve 1984', 'Sovereign Saffron', 'Black Ambergris 40%', 'Rose Damascena Reserve',
  'Grand Crus Maceration', 'Dynasty Oud', 'Celestial Aurora', 'Finer Reserve Gold',
  'Artisan Agarwood Flacon', 'Emperor Amber', 'Nocturne Private Blend', 'Pure Cambodi 100',
  'Regal Patchouli Grand', 'Golden Frankincense', 'Supreme Vetiver Extrait', 'Imperial Civet & Musk',
  'The Alchemist Collection', 'Crown Jewel Amber', 'Velvet Oud Supreme', 'Finer Artisan Millesime',
  'Monarch Private Reserve', 'Oud Al Malaki', 'The Obsidian Flacon', 'Gold Leaf Extrait',
  'Prestige Agarwood', 'Royal Sultan Blend', 'Celestial Solstice', 'Finer Sovereign 77',
  'Silk Road Oud', 'Taif Rose Private Blend', 'Imperial Amber 50ml', 'Oud Santal Rare',
  'The Master Flacon', 'Supreme Black Amber', 'Elysium Reserve', 'Private Vault Scent'
];

const discoveryNameRoots = [
  'The Signature Discovery Set', 'The Royal Oud Collection Kit', 'Summer Breeze Travel Trio',
  'Nocturne Evening Discovery 5x10ml', 'The Unisex Icons Discovery Box', 'Bestsellers Travel Coffret',
  'The Leather & Woods Discovery Set', 'Florals of the Orient Discovery', 'Citrus & Aquatic Explorer',
  'Extrait Intense Sample Vault', 'The Connoisseur 6-Piece Set', 'Winter Warmers Mini Kit',
  'Grand Luxury Coffret 10ml', 'The Amber Odyssey Travel Box', 'Private Reserve Discovery',
  'Artisanal Fragrance Wardrobe', 'The Master Perfumer Selection', 'Velvet Nights Sample Set',
  'The Fresh & Crisp Coffret', 'Arabian Heritage Mini Vials', 'Sillage Discovery Box',
  'The 5-Star Icons Travel Set', 'Royal Extrait Sampler', 'Gourmand & Spices Discovery Kit',
  'Pure Oud Exploration Box', 'The Celestial Mini Trio', 'High-Altitude Fresh Kit',
  'The Executive Discovery Set', 'Romantic Florals Travel Pack', 'Vintage Woods Mini Flacons',
  'The Golden Amber Travel Set', 'The Complete Collection Coffret', 'Weekend Explorer Discovery',
  'VIP Tasting Kit', 'The Daily Signature Set', 'The Luxury Maceration Discovery',
  'Oud Connoisseur Travel Box', 'Evening Seduction Sample Kit', 'The Royal Coffret', 'The Ultimate Arsenal'
];

const notesList = [
  'Amber Woody and Citrus',
  'Italian Bergamot, Ambroxan, Solar Cashmeran',
  'Warm Spicy, Tonka, Amber, Smoky Woods',
  'Oceanic Ozone, Sea Salt, White Amber',
  'Centifolia Rose, Bourbon Vanilla, Praline, White Musk',
  'Rare Agarwood, Black Pepper, Ambergris',
  'Saffron Threads, Bitter Almond, Virginian Cedar',
  'Oakmoss, Turkish Rose, Crisp Bergamot, Patchouli',
  'Jasmine Sambac, Tuberose, Orange Blossom Honey',
  'Cardamom, Sandalwood, Smoky Incense',
  'Dark Bergamot, Oud Smoke, Cedarwood',
  'Davana, Italian Bergamot, Pink Pepper, Vetiver Haiti',
  'Sweet Fig, Green Tea Leaves, Virginian Cedar',
  'Aged Bourbon, Toasted Oak, Dark Amber',
  'Calabrian Mandarin, Neroli Blossom, White Amber'
];

export async function seedBulk() {
  console.log('Connecting to PostgreSQL to seed 40 items per category...');

  const categoryConfigs = [
    { slug: 'for-men', gender: 'men', names: menNameRoots, basePrice: 2950 },
    { slug: 'for-women', gender: 'women', names: womenNameRoots, basePrice: 3200 },
    { slug: 'unisex', gender: 'unisex', names: unisexNameRoots, basePrice: 3800 },
    { slug: 'our-exclusives', gender: 'unisex', names: exclusiveNameRoots, basePrice: 5500 },
    { slug: 'discovery-sets', gender: 'unisex', names: discoveryNameRoots, basePrice: 3900 },
  ];

  for (const config of categoryConfigs) {
    console.log(`\nSeeding 40 items for category: ${config.slug}...`);

    for (let i = 0; i < 40; i++) {
      const name = config.names[i % config.names.length] + (i >= config.names.length ? ` No. ${i + 1}` : '');
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      // Check if already exists
      const existing = await pool.query(`SELECT id FROM products WHERE slug = $1`, [slug]);
      if (existing.rowCount && existing.rowCount > 0) {
        // Update category_slug
        await pool.query(`UPDATE products SET category_slug = $1 WHERE id = $2`, [config.slug, existing.rows[0].id]);
        continue;
      }

      const mainImg = perfumeImages[i % perfumeImages.length];
      const hoverImg = lifestyleImages[i % lifestyleImages.length];
      const notes = notesList[i % notesList.length];

      const price55 = config.basePrice + (i % 8) * 200;
      const originalPrice55 = price55 + 400;
      const price110 = Math.round(price55 * 1.65);
      const originalPrice110 = price110 + 700;

      const isSale = i % 3 === 0;
      const saleBadge = isSale ? `Sale -${5 + (i % 15)}%` : null;
      const isBestSeller = i < 8; // First 8 are best sellers
      const stock = i === 3 ? 0 : 8 + (i % 25); // Some out of stock for realistic sold-out badge

      const sizes = [
        { size: '55 ml', price: price55, original_price: originalPrice55, in_stock: stock > 0 },
        { size: '110 ml', price: price110, original_price: originalPrice110, in_stock: stock > 0 },
      ];

      await pool.query(
        `
        INSERT INTO products (
          name, slug, brand, tagline, description, inspiration, category_slug,
          rating, reviews_count, is_best_seller, is_sale, sale_badge, gender,
          occasion, season, notes, stock_count, main_image, hover_image, gallery, sizes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        );
      `,
        [
          name,
          slug,
          'THE PERFUME STORY',
          'Pure Extrait de Parfum • 35% Concentration',
          `${name} by THE PERFUME STORY is masterfully macerated for 60 days, yielding exceptional projection, longevity and sensory elegance.`,
          `Inspired by ${name}`,
          config.slug,
          5.0,
          10 + (i * 7) % 300,
          isBestSeller,
          isSale,
          saleBadge,
          config.gender,
          'Formal, Special Occasion, and Casual',
          'Fall, Spring, Summer, and Winter',
          notes,
          stock,
          mainImg,
          hoverImg,
          JSON.stringify([mainImg, hoverImg]),
          JSON.stringify(sizes),
        ]
      );
    }
    console.log(`✓ 40 items successfully verified / added for ${config.slug}`);
  }

  // Check counts
  const totalRes = await pool.query(`SELECT category_slug, count(*) FROM products GROUP BY category_slug`);
  console.log('\n--- CURRENT CATEGORY COUNTS IN DB ---');
  console.table(totalRes.rows);

  await pool.end();
  console.log('Seeding process completed!');
}

seedBulk().catch(err => {
  console.error('Error during bulk seeding:', err);
  process.exit(1);
});
