import express from 'express';
import session from 'express-session';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3500;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

const PRODUCTS = [
  { id: 'p1', name: 'Trail Runner Sneakers', price: 89.0, image: '👟', description: 'Lightweight sneakers built for daily miles.' },
  { id: 'p2', name: 'Insulated Steel Bottle', price: 24.5, image: '🧴', description: 'Keeps drinks cold for 24 hours.' },
  { id: 'p3', name: 'Canvas Weekender Bag', price: 64.0, image: '🎒', description: 'A weekend of clothes in one bag.' },
  { id: 'p4', name: 'Wireless Trail Earbuds', price: 129.0, image: '🎧', description: 'Sweat-resistant earbuds with 30h battery.' },
  { id: 'p5', name: 'Merino Wool Beanie', price: 22.0, image: '🧢', description: 'Warm, breathable, machine washable.' },
  { id: 'p6', name: 'Compact Camp Chair', price: 45.0, image: '🪑', description: 'Folds down to fit in a backpack pocket.' },
];

function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

const USERS = new Map();
USERS.set('existing.shopper@example.com', {
  email: 'existing.shopper@example.com',
  password: 'ExistingPass1!',
});

function cartView(req) {
  const cart = req.session.cart || {};
  const items = Object.entries(cart)
    .map(([productId, qty]) => {
      const product = findProduct(productId);
      if (!product) return null;
      return { ...product, qty, subtotal: Number((product.price * qty).toFixed(2)) };
    })
    .filter(Boolean);
  const total = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  return { items, total, count };
}

app.get('/api/products', (req, res) => {
  res.json(PRODUCTS);
});

app.get('/api/cart', (req, res) => {
  res.json(cartView(req));
});

app.post('/api/cart', (req, res) => {
  const { productId } = req.body || {};
  if (!findProduct(productId)) {
    return res.status(400).json({ error: 'unknown product' });
  }
  req.session.cart = req.session.cart || {};
  req.session.cart[productId] = (req.session.cart[productId] || 0) + 1;
  res.json(cartView(req));
});

app.put('/api/cart/:productId', (req, res) => {
  const { productId } = req.params;
  const qty = Number(req.body?.qty);
  if (!findProduct(productId)) {
    return res.status(400).json({ error: 'unknown product' });
  }
  if (!req.session.cart || !(productId in req.session.cart)) {
    return res.status(404).json({ error: 'not in cart' });
  }
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'quantity must be a positive integer' });
  }
  req.session.cart[productId] = qty;
  res.json(cartView(req));
});

app.delete('/api/cart/:productId', (req, res) => {
  const { productId } = req.params;
  if (req.session.cart) {
    delete req.session.cart[productId];
  }
  res.json(cartView(req));
});

app.get('/api/auth/me', (req, res) => {
  res.json({ email: req.session.user || null });
});

app.post('/api/auth/signup', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (USERS.has(email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }
  USERS.set(email, { email, password });
  req.session.user = email;
  res.json({ email });
});

app.post('/api/auth/signin', (req, res) => {
  const { email, password } = req.body || {};
  const user = USERS.get(email);
  if (!user) {
    return res.status(401).json({ error: 'No account found for that email.' });
  }
  if (user.password !== password) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  req.session.user = email;
  res.json({ email });
});

const ORDERS = new Map();

function isValidCardNumber(cardNumber) {
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (digits.length !== 16) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isValidExpiry(expiry) {
  const match = String(expiry || '').match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const expiryDate = new Date(year, month, 1);
  return expiryDate.getTime() > Date.now();
}

function isValidCvv(cvv) {
  return /^\d{3,4}$/.test(String(cvv || ''));
}

app.post('/api/orders', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'You must be signed in to place an order.' });
  }
  const cart = cartView(req);
  if (cart.items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' });
  }
  const { cardNumber, expiry, cvv } = req.body || {};
  if (!cardNumber || !expiry || !cvv) {
    return res.status(400).json({ error: 'Card number, expiry, and CVV are all required.' });
  }
  if (!isValidCardNumber(cardNumber)) {
    return res.status(400).json({ error: 'That card number is invalid.' });
  }
  if (!isValidExpiry(expiry)) {
    return res.status(400).json({ error: 'That card expiry date is invalid or expired.' });
  }
  if (!isValidCvv(cvv)) {
    return res.status(400).json({ error: 'That CVV is invalid.' });
  }
  const orderId = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const order = {
    id: orderId,
    email: req.session.user,
    items: cart.items,
    total: cart.total,
    createdAt: new Date().toISOString(),
  };
  ORDERS.set(orderId, order);
  req.session.cart = {};
  res.json(order);
});

app.get('/api/orders/:orderId', (req, res) => {
  const order = ORDERS.get(req.params.orderId);
  if (!order || order.email !== req.session.user) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  res.json(order);
});

app.get('/checkout', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/signin.html');
  }
  const cart = cartView(req);
  if (cart.items.length === 0) {
    return res.redirect('/cart.html');
  }
  res.sendFile(path.join(__dirname, 'views', 'checkout.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`guardiankane-ecommerce-demo listening on http://localhost:${PORT}`);
});
