import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3500;

app.use(express.json());

const PRODUCTS = [
  { id: 'p1', name: 'Trail Runner Sneakers', price: 89.0, image: '👟', description: 'Lightweight sneakers built for daily miles.' },
  { id: 'p2', name: 'Insulated Steel Bottle', price: 24.5, image: '🧴', description: 'Keeps drinks cold for 24 hours.' },
  { id: 'p3', name: 'Canvas Weekender Bag', price: 64.0, image: '🎒', description: 'A weekend of clothes in one bag.' },
  { id: 'p4', name: 'Wireless Trail Earbuds', price: 129.0, image: '🎧', description: 'Sweat-resistant earbuds with 30h battery.' },
  { id: 'p5', name: 'Merino Wool Beanie', price: 22.0, image: '🧢', description: 'Warm, breathable, machine washable.' },
  { id: 'p6', name: 'Compact Camp Chair', price: 45.0, image: '🪑', description: 'Folds down to fit in a backpack pocket.' },
];

app.get('/api/products', (req, res) => {
  res.json(PRODUCTS);
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`guardiankane-ecommerce-demo listening on http://localhost:${PORT}`);
});
