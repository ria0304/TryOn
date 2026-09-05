import { Garment } from '../types';
import { SAMPLE_GARMENTS } from './sampleGarments';

export const DEFAULT_GARMENTS: Garment[] = [
  // --- DRESSES ---
  {
    id: 'dress-1',
    name: 'Botanical Palm Sundress',
    category: 'dress',
    color: '#1e3a8a',
    style: 'a_line_dress',
    imageUrl: SAMPLE_GARMENTS[0].imageUrl,
    cutoutUrl: SAMPLE_GARMENTS[0].imageUrl,
    strapType: 'wide_straps',
    backStyle: 'covered_back',
  },
  {
    id: 'dress-2',
    name: 'Lilac A-Line Maxi Dress',
    category: 'dress',
    color: '#c084fc', // Lilac
    style: 'maxi_dress',
    imageUrl: SAMPLE_GARMENTS[0].imageUrl,
    cutoutUrl: SAMPLE_GARMENTS[0].imageUrl,
    strapType: 'wide_straps',
    backStyle: 'covered_back',
  },
  {
    id: 'dress-3',
    name: 'Emerald Silk Sweetheart Slip',
    category: 'dress',
    color: '#064e3b',
    style: 'slip_dress',
    imageUrl: SAMPLE_GARMENTS[1].imageUrl,
    cutoutUrl: SAMPLE_GARMENTS[1].imageUrl,
    strapType: 'thin_double_straps',
    backStyle: 'open_back',
  },
  {
    id: 'dress-4',
    name: 'Parisian Rose Floral Sundress',
    category: 'dress',
    color: '#f43f5e',
    style: 'fit_and_flare',
    imageUrl: SAMPLE_GARMENTS[2].imageUrl,
    cutoutUrl: SAMPLE_GARMENTS[2].imageUrl,
    strapType: 'thin_double_straps',
    backStyle: 'open_back',
  },
  {
    id: 'dress-5',
    name: 'Riviera Navy Halter Maxi',
    category: 'dress',
    color: '#1e1b4b',
    style: 'halter_maxi',
    imageUrl: SAMPLE_GARMENTS[3].imageUrl,
    cutoutUrl: SAMPLE_GARMENTS[3].imageUrl,
    strapType: 'halter_neck',
    backStyle: 'tie_back',
  },

  // --- TOPS ---
  {
    id: 'top-1',
    name: 'Chic Ribbed Tank',
    category: 'top',
    color: '#ffffff',
    style: 'tank_top',
  },
  {
    id: 'top-2',
    name: 'Classic Crop Tee',
    category: 'top',
    color: '#e879f9', // Light Fuchsia
    style: 'tshirt',
  },
  {
    id: 'top-3',
    name: 'Oversized Pastel Sweater',
    category: 'top',
    color: '#fed7aa', // Soft Orange/Peach
    style: 'sweater',
  },
  {
    id: 'top-4',
    name: 'Silk Puff-Sleeve Blouse',
    category: 'top',
    color: '#cbd5e1', // Slate Blue/Gray
    style: 'blouse',
  },
  {
    id: 'top-5',
    name: 'Streetwear French Hoodie',
    category: 'top',
    color: '#374151', // Dark Gray
    style: 'hoodie',
  },

  // --- BOTTOMS ---
  {
    id: 'bottom-1',
    name: 'Pleated Tennis Skirt',
    category: 'bottom',
    color: '#111827', // Black
    style: 'pleated_skirt',
  },
  {
    id: 'bottom-2',
    name: 'High-Waist Classic Denim',
    category: 'bottom',
    color: '#60a5fa', // Blue
    style: 'denim_jeans',
  },
  {
    id: 'bottom-3',
    name: 'Tailored Wide-Leg Trousers',
    category: 'bottom',
    color: '#a1a1aa', // Zinc Gray
    style: 'wide_pants',
  },
  {
    id: 'bottom-4',
    name: 'Linen A-Line Midi Skirt',
    category: 'bottom',
    color: '#e7e5e4', // Warm Off-White/Sand
    style: 'midi_skirt',
  },
  {
    id: 'bottom-5',
    name: 'Retro Denim Shorts',
    category: 'bottom',
    color: '#93c5fd', // Light Blue Denim
    style: 'shorts',
  },

  // --- SHOES ---
  {
    id: 'shoes-1',
    name: 'Retro Chunky Sneakers',
    category: 'shoes',
    color: '#ffffff',
    style: 'sneakers',
  },
  {
    id: 'shoes-2',
    name: 'Ankle-Strap Block Heels',
    category: 'shoes',
    color: '#db2777', // Rose Pink
    style: 'heels',
  },
  {
    id: 'shoes-3',
    name: 'Combat Platform Boots',
    category: 'shoes',
    color: '#1e293b', // Deep Charcoal
    style: 'boots',
  },
  {
    id: 'shoes-4',
    name: 'Woven Leather Sandals',
    category: 'shoes',
    color: '#b45309', // Warm Amber
    style: 'sandals',
  },

  // --- BAGS ---
  {
    id: 'bag-1',
    name: 'Structured Canvas Tote',
    category: 'bag',
    color: '#f5f5f4', // Off-white
    style: 'backpack',
  },
  {
    id: 'bag-2',
    name: 'Leather Baguette Shoulder Bag',
    category: 'bag',
    color: '#ec4899', // Pink
    style: 'shoulder_bag',
  },
  {
    id: 'bag-3',
    name: 'Quilted Chain Handbag',
    category: 'bag',
    color: '#18181b', // Matte Black
    style: 'handbag',
  },
  {
    id: 'bag-4',
    name: 'Envelope Evening Clutch',
    category: 'bag',
    color: '#fbbf24', // Amber/Gold
    style: 'clutch',
  },

  // --- ACCESSORIES ---
  {
    id: 'acc-1',
    name: 'French Wool Beret',
    category: 'accessories',
    color: '#991b1b', // Deep Crimson Red
    style: 'beret',
  },
  {
    id: 'acc-2',
    name: 'Aviator Wire Sunglasses',
    category: 'accessories',
    color: '#000000',
    style: 'glasses',
  },
  {
    id: 'acc-3',
    name: 'Dainty Layered Gold Chain',
    category: 'accessories',
    color: '#fbbf24', // Gold
    style: 'necklace',
  },
  {
    id: 'acc-4',
    name: 'Cosy Ribbed Fringe Scarf',
    category: 'accessories',
    color: '#a78bfa', // Lavender
    style: 'scarf',
  },
  {
    id: 'acc-5',
    name: 'Silk Hair Bow Ribbon',
    category: 'accessories',
    color: '#ec4899', // Hot Pink
    style: 'ribbon',
  },
];
