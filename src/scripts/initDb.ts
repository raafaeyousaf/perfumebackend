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

async function init() {
  console.log(`Connecting to PostgreSQL as ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}...`);

  // Step 1: Connect to root 'postgres' db
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
      console.log(`Database "${targetDatabase}" does not exist. Creating...`);
      await rootClient.query(`CREATE DATABASE "${targetDatabase}"`);
    }
  } catch (err) {
    console.error('Error during root database check:', err);
    throw err;
  } finally {
    await rootClient.end();
  }

  // Step 2: Connect to target database
  const appPool = new Pool({
    ...dbConfig,
    database: targetDatabase,
  });

  try {
    console.log(`Setting up schema, categories, and users in "${targetDatabase}"...`);

    // Create Categories Table
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

    // Create Users Table
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

    // Create Products Table
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

    // Ensure category_slug column exists if products was created previously
    await appPool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='category_slug') THEN
          ALTER TABLE products ADD COLUMN category_slug VARCHAR(100) DEFAULT 'unisex';
        END IF;
      END $$;
    `);

    // Create Reviews Table
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
    console.log(`Seeded ${initialCategories.length} categories.`);

    // Seed default Admin & Buyer users
    const adminCheck = await appPool.query(`SELECT 1 FROM users WHERE email = $1`, [
      'admin@theperfumestory.com',
    ]);
    if (adminCheck.rowCount === 0) {
      await appPool.query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4);`,
        ['Admin', 'admin@theperfumestory.com', 'admin123', 'admin']
      );
    }

    // Update existing products with category_slug mappings
    await appPool.query(`
      UPDATE products SET category_slug = 'for-men' WHERE gender = 'men' AND (category_slug IS NULL OR category_slug = 'unisex');
      UPDATE products SET category_slug = 'for-women' WHERE gender = 'women' AND (category_slug IS NULL OR category_slug = 'unisex');
      UPDATE products SET category_slug = 'unisex' WHERE gender = 'unisex' AND category_slug IS NULL;
    `);

    console.log('Database, categories, and products setup verified successfully!');
  } catch (err) {
    console.error('Error during schema setup:', err);
    throw err;
  } finally {
    await appPool.end();
  }
}

init()
  .then(() => {
    console.log('Database initialization complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Initialization failed:', err);
    process.exit(1);
  });
