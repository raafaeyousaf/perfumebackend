import { Request, Response } from 'express';
import { query } from '../config/db.js';
import { sendOtpEmail } from '../services/emailService.js';

// Ensure OTPs table exists
const ensureOtpsTable = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS otps (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        purpose VARCHAR(50) DEFAULT 'login',
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(LOWER(email));
    `);
  } catch (err) {
    console.error('Error ensuring otps table exists:', err);
  }
};

ensureOtpsTable();

// 1. Standard Password Login
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

    // Password comparison
    if (user.password !== password) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    res.json({
      success: true,
      message: `${user.role === 'admin' ? 'Administrator' : 'User'} logged in successfully`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token: `${user.role}-token-${user.id}-${Date.now()}`,
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

// 2. Standard Registration
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
      token: `buyer-token-${result.rows[0].id}-${Date.now()}`,
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

// 3. Send 6-Digit OTP Code
// Sender: contact@thepperfumestory.com
export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureOtpsTable();
    const { email, purpose = 'login' } = req.body;

    if (!email || !email.includes('@')) {
      res.status(400).json({
        success: false,
        message: 'A valid email address is required to dispatch OTP.',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Remove any previous active OTPs for this email
    await query(`DELETE FROM otps WHERE LOWER(email) = LOWER($1)`, [cleanEmail]);

    // Save new OTP with 10-minute expiry
    await query(
      `INSERT INTO otps (email, code, purpose, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
      [cleanEmail, otpCode, purpose]
    );

    // Send email from contact@thepperfumestory.com asynchronously
    sendOtpEmail(cleanEmail, otpCode, purpose).catch((err) => {
      console.warn('Background sendOtpEmail error:', err);
    });

    res.json({
      success: true,
      message: `A 6-digit security code has been dispatched to ${cleanEmail} from contact@thepperfumestory.com.`,
      // For instant debugging / local testing if SMTP network blocked:
      expires_in_minutes: 10,
    });
  } catch (error: any) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate security code.',
      error: error.message,
    });
  }
};

// 4. Verify 6-Digit OTP Code & Auto Login / Register
export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureOtpsTable();
    const { email, code, name } = req.body;

    if (!email || !code) {
      res.status(400).json({
        success: false,
        message: 'Email and verification code are required.',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    const otpCheck = await query(
      `SELECT * FROM otps WHERE LOWER(email) = LOWER($1) AND code = $2 AND expires_at > NOW()`,
      [cleanEmail, cleanCode]
    );

    if (otpCheck.rows.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code. Please request a new code.',
      });
      return;
    }

    // OTP is valid! Delete it so it cannot be reused
    await query(`DELETE FROM otps WHERE LOWER(email) = LOWER($1)`, [cleanEmail]);

    // Check if user already exists
    const userResult = await query(
      `SELECT id, name, email, role FROM users WHERE LOWER(email) = LOWER($1)`,
      [cleanEmail]
    );

    let user;
    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
    } else {
      // Auto-register new buyer account
      const displayName = name && name.trim() ? name.trim() : cleanEmail.split('@')[0];
      const autoPass = `otp-${Date.now()}`;
      const newUserRes = await query(
        `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'buyer') RETURNING id, name, email, role`,
        [displayName, cleanEmail, autoPass]
      );
      user = newUserRes.rows[0];
    }

    res.json({
      success: true,
      message: 'Identity verified successfully! Welcome to The Perfume Story.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token: `${user.role}-token-${user.id}-${Date.now()}`,
    });
  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during OTP verification.',
      error: error.message,
    });
  }
};
