import { Request, Response } from 'express';
import { query } from '../config/db.js';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
      return;
    }

    const result = await query(
      `SELECT id, name, email, password, role FROM users WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    const user = result.rows[0];

    // For now simple password comparison (can be enhanced with bcrypt)
    if (user.password !== password) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    // Role check: Only admin is permitted to login for now as requested
    if (user.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Customer accounts are view-only right now. Only Admin can log in.',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Admin logged in successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token: `admin-token-${user.id}-${Date.now()}`,
    });
  } catch (error: any) {
    console.error('Error during login:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message,
    });
  }
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role = 'buyer' } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
      return;
    }

    const existingUser = await query(`SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`, [
      email.trim(),
    ]);

    if (existingUser.rowCount && existingUser.rowCount > 0) {
      res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
      return;
    }

    const result = await query(
      `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`,
      [name, email.trim(), password, role]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error during user registration:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message,
    });
  }
};
