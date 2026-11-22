import { Client, Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'raafae',
};

const targetDatabase = process.env.POSTGRES_DB || 'theperfumestory';

// Wait for PostgreSQL to become reachable
async function waitForPostgres(maxAttempts = 30, delayMs = 2000): Promise<void> {
  console.log(`Checking connection to PostgreSQL at ${dbConfig.host}:${dbConfig.port}...`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new Client({
      ...dbConfig,
      database: 'postgres',
      connectionTimeoutMillis: 3000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log(`✓ PostgreSQL is online and accepting connections (attempt ${attempt})`);
      return;
    } catch (err: any) {
      console.log(`[Attempt ${attempt}/${maxAttempts}] PostgreSQL not ready yet (${err.message}). Retrying in ${delayMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Failed to connect to PostgreSQL after ${maxAttempts} attempts.`);
}

async function autoSetup(): Promise<void> {
  await waitForPostgres();

  // Step 1: Check / Create database
  const rootClient = new Client({
    ...dbConfig,
    database: 'postgres',
  });

  try {
    await rootClient.connect();
    const checkDb = await rootClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDatabase]
    );

    if (checkDb.rowCount === 0) {
      console.log(`Database "${targetDatabase}" does not exist. Creating now...`);
      await rootClient.query(`CREATE DATABASE "${targetDatabase}"`);
      console.log(`✓ Database "${targetDatabase}" created successfully.`);
    } else {
      console.log(`✓ Database "${targetDatabase}" already exists.`);
    }
  } finally {
    await rootClient.end();
  }

  // Step 2: Connect to the application database & verify tables
  const appPool = new Pool({
    ...dbConfig,
    database: targetDatabase,
  });

  try {
    console.log(`Checking database schema in "${targetDatabase}"...`);

    // Categories
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        display_order INT DEFAULT 0,
        is_nav_visible BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Users
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'buyer',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Products
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        brand VARCHAR(100) DEFAULT 'THE PERFUME STORY',
        tagline VARCHAR(255),
        description TEXT,
        inspiration VARCHAR(255),
        category_slug VARCHAR(100) DEFAULT 'unisex',
        rating DECIMAL(3,1) DEFAULT 5.0,
        reviews_count INT DEFAULT 0,
        is_best_seller BOOLEAN DEFAULT false,
        is_sale BOOLEAN DEFAULT false,
        sale_badge VARCHAR(50),
        gender VARCHAR(50) NOT NULL,
        occasion VARCHAR(255),
        season VARCHAR(255),
        notes VARCHAR(255),
        stock_count INT DEFAULT 15,
        main_image TEXT NOT NULL,
        hover_image TEXT,
        gallery JSONB DEFAULT '[]'::jsonb,
        sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Reviews
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        product_id INT REFERENCES products(id) ON DELETE CASCADE,
        author VARCHAR(100) NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT NOT NULL,
        verified BOOLEAN DEFAULT true,
        size_reviewed VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Orders
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        customer_name VARCHAR(150) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50) NOT NULL,
        shipping_address TEXT NOT NULL,
        city VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20),
        order_notes TEXT,
        payment_method VARCHAR(50) DEFAULT 'cod',
        subtotal NUMERIC(10, 2) NOT NULL,
        shipping_fee NUMERIC(10, 2) DEFAULT 0,
        total_amount NUMERIC(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    `);

    // Seed Categories
    const initialCategories = [
      { name: 'Catalog', slug: 'catalog', description: 'Complete collection of artisanal extraits', display_order: 1 },
      { name: 'Discovery Sets', slug: 'discovery-sets', description: 'Curated 10ml travel sample kits', display_order: 2 },
      { name: 'Our Exclusives', slug: 'our-exclusives', description: 'Limited private reserve formulations', display_order: 3 },
      { name: 'For Men', slug: 'for-men', description: 'Masculine woody, amber, and aquatic extraits', display_order: 4 },
      { name: 'For Women', slug: 'for-women', description: 'Sensual floral, vanilla, and amber compositions', display_order: 5 },
      { name: 'Unisex', slug: 'unisex', description: 'Genderless masterworks for timeless presence', display_order: 6 },
      { name: 'Sale', slug: 'sale', description: 'Special seasonal offers & archived flacons', display_order: 7 },
    ];

    for (const cat of initialCategories) {
      await appPool.query(
        `
        INSERT INTO categories (name, slug, description, display_order, is_nav_visible)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          display_order = EXCLUDED.display_order;
      `,
        [cat.name, cat.slug, cat.description, cat.display_order]
      );
    }

    // Seed default Admin user if not present
    const adminCheck = await appPool.query(`SELECT 1 FROM users WHERE email = $1`, [
      'admin@theperfumestory.com',
    ]);
    if (adminCheck.rowCount === 0) {
      await appPool.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4);`,
        ['Admin', 'admin@theperfumestory.com', 'admin123', 'admin']
      );
      console.log('✓ Default Admin account seeded: admin@theperfumestory.com / admin123');
    }

    // Check if products need seeding
    const productCountRes = await appPool.query(`SELECT COUNT(*)::int as count FROM products`);
    const totalCount = productCountRes.rows[0].count;

    if (totalCount === 0) {
      console.log('Database has 0 products. Initiating bulk seed (40+ items per category)...');
      // Import and run seedBulk
      const { seedBulk } = await import('./seedBulkProducts.js');
      await seedBulk();
      console.log('✓ Bulk seeding completed successfully!');
    } else {
      console.log(`✓ Products table already contains ${totalCount} items. Skipping initial bulk seed.`);
    }

    console.log('=========================================');
    console.log('🌸 DATABASE READY FOR PRODUCTION 🌸');
    console.log('=========================================');
  } finally {
    await appPool.end();
  }
}

autoSetup()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal database auto-setup error:', err);
    process.exit(1);
  });
