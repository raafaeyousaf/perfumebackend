import { Request, Response } from 'express';
import { query } from '../config/db.js';

export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { gender, category, is_best_seller, is_sale, search, sort, season } = req.query;

    let sql = `SELECT * FROM products WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    // Filter by season query if provided
    if (season && typeof season === 'string') {
      sql += ` AND (LOWER(season) LIKE $${paramIndex} OR LOWER(notes) LIKE $${paramIndex} OR LOWER(description) LIKE $${paramIndex})`;
      params.push(`%${season.toLowerCase()}%`);
      paramIndex++;
    }

    // Filter by category or category slug
    if (category && typeof category === 'string') {
      const catLower = category.toLowerCase().trim();
      if (catLower === 'catalog' || catLower === 'all') {
        // Catalog shows all items
      } else if (catLower === 'sale') {
        sql += ` AND is_sale = true`;
      } else if (catLower === 'for-men' || catLower === 'men') {
        sql += ` AND (LOWER(category_slug) = 'for-men' OR LOWER(gender) = 'men' OR LOWER(gender) = 'unisex')`;
      } else if (catLower === 'for-women' || catLower === 'women') {
        sql += ` AND (LOWER(category_slug) = 'for-women' OR LOWER(gender) = 'women' OR LOWER(gender) = 'unisex')`;
      } else if (catLower === 'unisex') {
        sql += ` AND (LOWER(category_slug) = 'unisex' OR LOWER(gender) = 'unisex')`;
      } else if (['fall', 'summer', 'spring', 'winter'].includes(catLower)) {
        sql += ` AND (LOWER(season) LIKE $${paramIndex} OR LOWER(notes) LIKE $${paramIndex} OR LOWER(description) LIKE $${paramIndex})`;
        params.push(`%${catLower}%`);
        paramIndex++;
      } else {
        sql += ` AND (LOWER(category_slug) = LOWER($${paramIndex}) OR LOWER(slug) LIKE $${paramIndex})`;
        params.push(catLower);
        paramIndex++;
      }
    }

    if (gender && typeof gender === 'string') {
      sql += ` AND LOWER(gender) = LOWER($${paramIndex++})`;
      params.push(gender);
    }

    if (is_best_seller === 'true') {
      sql += ` AND is_best_seller = true`;
    }

    if (is_sale === 'true') {
      sql += ` AND is_sale = true`;
    }

    if (search && typeof search === 'string') {
      sql += ` AND (LOWER(name) LIKE $${paramIndex} OR LOWER(notes) LIKE $${paramIndex} OR LOWER(inspiration) LIKE $${paramIndex})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIndex++;
    }

    // Sorting
    if (sort === 'price_asc') {
      sql += ` ORDER BY (sizes->0->>'price')::numeric ASC`;
    } else if (sort === 'price_desc') {
      sql += ` ORDER BY (sizes->0->>'price')::numeric DESC`;
    } else if (sort === 'rating') {
      sql += ` ORDER BY rating DESC, reviews_count DESC`;
    } else {
      sql += ` ORDER BY id ASC`;
    }

    const result = await query(sql, params);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message,
    });
  }
};

export const getProductBySlugOrId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier } = req.params;
    const cleanId = (identifier || '').trim();

    let sql = `SELECT * FROM products WHERE LOWER(slug) = LOWER($1) OR LOWER(REPLACE(name, ' ', '-')) = LOWER($1)`;
    let params: any[] = [cleanId];

    if (/^\d+$/.test(cleanId)) {
      sql = `SELECT * FROM products WHERE id = $1 OR LOWER(slug) = LOWER($2)`;
      params = [parseInt(cleanId, 10), cleanId];
    }

    const productResult = await query(sql, params);

    if (productResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
      });
      return;
    }

    const product = productResult.rows[0];

    // Fetch reviews for this product
    const reviewsResult = await query(
      `SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC`,
      [product.id]
    );

    product.reviews = reviewsResult.rows;

    res.json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    console.error('Error fetching product detail:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product detail',
      error: error.message,
    });
  }
};

export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      slug,
      brand = 'THE PERFUME STORY',
      tagline,
      description,
      inspiration,
      category_slug = 'unisex',
      rating = 5.0,
      reviews_count = 0,
      is_best_seller = false,
      is_sale = false,
      sale_badge,
      gender,
      occasion,
      season,
      notes,
      stock_count = 15,
      main_image,
      hover_image,
      gallery = [],
      sizes = [],
    } = req.body;

    if (!name || !gender || !main_image) {
      res.status(400).json({
        success: false,
        message: 'Name, gender, and main_image are required',
      });
      return;
    }

    const finalSlug =
      slug ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const insertSql = `
      INSERT INTO products (
        name, slug, brand, tagline, description, inspiration, category_slug, rating, reviews_count,
        is_best_seller, is_sale, sale_badge, gender, occasion, season, notes, stock_count,
        main_image, hover_image, gallery, sizes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *;
    `;

    const result = await query(insertSql, [
      name,
      finalSlug,
      brand,
      tagline,
      description,
      inspiration,
      category_slug,
      rating,
      reviews_count,
      is_best_seller,
      is_sale,
      sale_badge,
      gender,
      occasion,
      season,
      notes,
      stock_count,
      main_image,
      hover_image || main_image,
      JSON.stringify(gallery),
      JSON.stringify(sizes),
    ]);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message,
    });
  }
};

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (
        [
          'name',
          'brand',
          'tagline',
          'description',
          'inspiration',
          'category_slug',
          'rating',
          'reviews_count',
          'is_best_seller',
          'is_sale',
          'sale_badge',
          'gender',
          'occasion',
          'season',
          'notes',
          'stock_count',
          'main_image',
          'hover_image',
        ].includes(key)
      ) {
        fields.push(`${key} = $${idx++}`);
        values.push(val);
      } else if (key === 'sizes' || key === 'gallery') {
        fields.push(`${key} = $${idx++}`);
        values.push(JSON.stringify(val));
      }
    }

    if (fields.length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(parseInt(id, 10));

    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
};

export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM products WHERE id = $1 RETURNING id`, [parseInt(id, 10)]);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    res.json({ success: true, message: 'Product deleted successfully', id });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
};

export const addReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const { author, rating, comment, size_reviewed } = req.body;

    if (!author || !rating || !comment) {
      res.status(400).json({ success: false, message: 'Author, rating, and comment are required' });
      return;
    }

    const insertSql = `
      INSERT INTO reviews (product_id, author, rating, comment, verified, size_reviewed)
      VALUES ($1, $2, $3, $4, true, $5) RETURNING *;
    `;
    const result = await query(insertSql, [
      parseInt(productId, 10),
      author,
      rating,
      comment,
      size_reviewed || '55 ml',
    ]);

    await query(
      `UPDATE products SET reviews_count = reviews_count + 1 WHERE id = $1`,
      [parseInt(productId, 10)]
    );

    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error adding review:', error);
    res.status(500).json({ success: false, message: 'Failed to add review', error: error.message });
  }
};
