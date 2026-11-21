import { Router } from 'express';
import {
  getProducts,
  getProductBySlugOrId,
  createProduct,
  updateProduct,
  deleteProduct,
  addReview,
} from '../controllers/productController.js';

const router = Router();

router.get('/', getProducts);
router.get('/:identifier', getProductBySlugOrId);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);
router.post('/:productId/reviews', addReview);

export default router;
