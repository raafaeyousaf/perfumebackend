import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import productRoutes from './routes/productRoutes.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import { query } from './config/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['*'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health Check
app.get('/api/health', async (_req, res) => {
  try {
    const dbTest = await query('SELECT NOW()');
    res.json({
      status: 'online',
      message: 'THE PERFUME STORY API is healthy',
      database: 'connected',
      timestamp: dbTest.rows[0].now,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'degraded',
      message: 'Database connection issue',
      error: err.message,
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🌸 THE PERFUME STORY BACKEND RUNNING 🌸`);
  console.log(`Port: ${PORT}`);
  console.log(`Categories: http://localhost:${PORT}/api/categories`);
  console.log(`Products:   http://localhost:${PORT}/api/products`);
  console.log(`Orders:     http://localhost:${PORT}/api/orders`);
  console.log(`Auth:       http://localhost:${PORT}/api/auth/login`);
  console.log(`=========================================`);
});
