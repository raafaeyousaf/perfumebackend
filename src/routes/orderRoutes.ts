import { Router } from 'express';
import {
  createOrder,
  getAllOrders,
  getMyOrders,
  trackOrder,
  updateOrderStatus,
} from '../controllers/orderController.js';

const router = Router();

// Create new order
router.post('/', createOrder);

// Admin: Get all orders
router.get('/', getAllOrders);

// User: Get customer orders
router.get('/my-orders', getMyOrders);

// Track order by orderNumber
router.get('/track/:orderNumber', trackOrder);

// Admin: Update order status (Accept / Reject / Shipped / etc)
router.patch('/:id/status', updateOrderStatus);

export default router;
