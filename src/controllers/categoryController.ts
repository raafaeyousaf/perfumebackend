import { Request, Response } from 'express';
import { query } from '../config/db.js';

export const getCategories = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT * FROM categories WHERE is_nav_visible = true ORDER BY display_order ASC, id ASC`
    );
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message,
    });
  }
};

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, slug, description, display_order = 0, is_nav_visible = true } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }

    const finalSlug =
      slug ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const result = await query(
      `
      INSERT INTO categories (name, slug, description, display_order, is_nav_visible)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        display_order = EXCLUDED.display_order
      RETURNING *;
    `,
      [name, finalSlug, description, display_order, is_nav_visible]
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message,
    });
  }
};
