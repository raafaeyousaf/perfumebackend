export interface ProductSize {
  size: string; // e.g. '55 ml', '110 ml'
  price: number;
  original_price?: number;
  in_stock: boolean;
  sku?: string;
}

export interface Review {
  id?: number;
  product_id?: number;
  author: string;
  rating: number;
  comment: string;
  verified: boolean;
  size_reviewed?: string;
  created_at?: string;
}

export interface Product {
  id?: number;
  name: string;
  slug: string;
  brand?: string;
  tagline?: string;
  description?: string;
  inspiration?: string;
  rating?: number;
  reviews_count?: number;
  is_best_seller?: boolean;
  is_sale?: boolean;
  sale_badge?: string;
  gender: 'men' | 'women' | 'unisex';
  occasion?: string;
  season?: string;
  notes?: string;
  stock_count?: number;
  main_image: string;
  hover_image?: string;
  gallery?: string[];
  sizes: ProductSize[];
  reviews?: Review[];
  created_at?: string;
  updated_at?: string;
}
