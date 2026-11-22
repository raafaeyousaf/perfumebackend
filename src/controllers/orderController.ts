import { Request, Response } from 'express';
import { query } from '../config/db.js';
import {
  sendOrderConfirmationEmail,
  sendOrderReceiptEmail,
  sendCartNotificationEmail,
  sendOrderStatusUpdateEmail,
} from '../services/emailService.js';

export interface OrderItem {
  product_id: number;
  name: string;
  size: string;
  price: number;
  quantity: number;
  image: string;
}

// Helper: Ensure orders table exists in PostgreSQL
export const ensureOrdersTable = async (): Promise<void> => {
  try {
    await query(`
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
  } catch (err) {
    console.error('Error ensuring orders table exists:', err);
  }
};

// 1. Create a new Order
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureOrdersTable();

    const {
      user_id,
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      city,
      postal_code,
      order_notes,
      payment_method = 'cod',
      items = [],
    } = req.body;

    if (!customer_name || !customer_email || !customer_phone || !shipping_address || !city) {
      res.status(400).json({
        success: false,
        message: 'Name, email, phone number, shipping address, and city are required.',
      });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Order must contain at least one fragrance item.',
      });
      return;
    }

    // Calculate subtotal
    const subtotal = items.reduce(
      (sum: number, item: OrderItem) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
      0
    );

    // Free delivery above PKR 5,000, otherwise PKR 200 nationwide delivery
    const shipping_fee = subtotal >= 5000 ? 0 : 200;
    const total_amount = subtotal + shipping_fee;

    // Generate unique Order Number e.g. TPS-894215
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const order_number = `TPS-${randomSuffix}`;

    const insertResult = await query(
      `
      INSERT INTO orders (
        order_number, user_id, customer_name, customer_email, customer_phone,
        shipping_address, city, postal_code, order_notes, payment_method,
        subtotal, shipping_fee, total_amount, status, items
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14)
      RETURNING *
      `,
      [
        order_number,
        user_id || null,
        customer_name.trim(),
        customer_email.trim().toLowerCase(),
        customer_phone.trim(),
        shipping_address.trim(),
        city.trim(),
        postal_code ? postal_code.trim() : '',
        order_notes ? order_notes.trim() : '',
        payment_method,
        subtotal,
        shipping_fee,
        total_amount,
        JSON.stringify(items),
      ]
    );

    const savedOrder = insertResult.rows[0];

    // Asynchronously dispatch the 2 official emails from sales@thepperfumestory.com:
    // 1. Order Confirmation Email
    // 2. Official Tax Invoice & Order Receipt Email
    Promise.allSettled([
      sendOrderConfirmationEmail(savedOrder),
      sendOrderReceiptEmail(savedOrder),
    ]).catch((err) => {
      console.warn('Background order email dispatch warning:', err);
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully! The atelier is preparing your consignment.',
      order: savedOrder,
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record order in database.',
      error: error.message,
    });
  }
};

// 2. Admin: Get all orders
export const getAllOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureOrdersTable();
    const { status } = req.query;

    let sql = 'SELECT * FROM orders';
    const params: any[] = [];

    if (status && status !== 'all') {
      sql += ' WHERE LOWER(status) = LOWER($1)';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rowCount,
    });
  } catch (error: any) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders from database.',
      error: error.message,
    });
  }
};

// 3. User: Get my orders
export const getMyOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureOrdersTable();
    const { user_id, email } = req.query;

    if (!user_id && !email) {
      res.status(400).json({
        success: false,
        message: 'user_id or email is required to fetch customer orders.',
      });
      return;
    }

    let sql = 'SELECT * FROM orders WHERE ';
    const conditions: string[] = [];
    const params: any[] = [];

    if (user_id) {
      params.push(user_id);
      conditions.push(`user_id = $${params.length}`);
    }

    if (email) {
      params.push(String(email).trim().toLowerCase());
      conditions.push(`LOWER(customer_email) = $${params.length}`);
    }

    sql += conditions.join(' OR ') + ' ORDER BY created_at DESC';

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your order history.',
      error: error.message,
    });
  }
};

// 4. Public: Track order by order_number
export const trackOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureOrdersTable();
    const { orderNumber } = req.params;

    if (!orderNumber) {
      res.status(400).json({
        success: false,
        message: 'Order number is required.',
      });
      return;
    }

    const result = await query(
      `SELECT * FROM orders WHERE UPPER(order_number) = UPPER($1)`,
      [orderNumber.trim()]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: `Order #${orderNumber} could not be located in our registry.`,
      });
      return;
    }

    res.json({
      success: true,
      order: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error tracking order:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching for order.',
      error: error.message,
    });
  }
};

// 5. Admin: Update order status (Accept, Reject, Shipped, Delivered)
export const updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureOrdersTable();
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'rejected', 'preparing', 'shipped', 'delivered', 'cancelled'];
    if (!status || !validStatuses.includes(status.toLowerCase())) {
      res.status(400).json({
        success: false,
        message: `Invalid status. Valid statuses are: ${validStatuses.join(', ')}`,
      });
      return;
    }

    const result = await query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status.toLowerCase(), id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
      return;
    }

    const updatedOrder = result.rows[0];

    // Asynchronously dispatch luxury status update email to the customer from sales@thepperfumestory.com
    if (updatedOrder && updatedOrder.customer_email) {
      sendOrderStatusUpdateEmail(updatedOrder, status.toLowerCase()).catch((err) => {
        console.warn('Background order status update email warning:', err);
      });
    }

    res.json({
      success: true,
      message: `Order status successfully updated to ${status}.`,
      order: updatedOrder,
    });
  } catch (error: any) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status.',
      error: error.message,
    });
  }
};

// 6. Notify Cart: Dispatches cart reservation email from sales@thepperfumestory.com
export const notifyCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name, product, size, quantity = 1 } = req.body;
    if (!email || !product) {
      res.status(400).json({ success: false, message: 'Email and product details are required.' });
      return;
    }

    sendCartNotificationEmail(email.trim().toLowerCase(), name || '', product, size, quantity).catch((err) => {
      console.warn('Background cart notification email warning:', err);
    });

    res.json({ success: true, message: 'Cart reservation email dispatched.' });
  } catch (error: any) {
    console.error('Error notifying cart:', error);
    res.status(500).json({ success: false, message: 'Failed to notify cart.', error: error.message });
  }
};
