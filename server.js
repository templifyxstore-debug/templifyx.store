const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'replace-this-secret-in-production';
const DEFAULT_PORT = Number(process.env.PORT || 3000);

// Replace these IDs and URLs with your real product mapping.
const productLinks = {
  'PID-001': 'https://your-product.netlify.app',
  'PID-002': 'https://another-product.netlify.app'
};

// TODO: Replace with your real database / purchase validation.
const userPurchases = {
  'user_1': new Set(['PID-001', 'PID-002'])
};

const app = express();
app.use(express.json());

const PRODUCTS_FILE_PATH = path.join(__dirname, 'data', 'products.json');

function getDefaultProducts() {
  return [
    { id: 'p_seed_1', name: 'Digital Product Web Template', code: 'G7H8I9', description: 'A modern and responsive web template for digital products.', previewImage: 'video/web2.mp4', previewUrl: 'https://templifyx.com/templates/digital-product', product_id: 'PID-001', category: 'Dashboard', tier: 'free', price: '0' },
    { id: 'p_seed_2', name: 'Growth Marketing Web Kit', code: 'TPL-002', description: 'Landing pages and sections optimized for conversion teams.', previewImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80', previewUrl: 'https://templifyx.com/templates/growth', product_id: 'PID-002', category: 'Marketing', tier: 'basic', price: '19' },
    { id: 'p_seed_3', name: 'Mobile Fintech UI', code: 'TPL-003', description: 'Modern mobile app screens for finance and SaaS startups.', previewImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80', previewUrl: 'https://templifyx.com/templates/fintech', product_id: 'PID-003', category: 'UI', tier: 'pro', price: '29' }
  ];
}

function readProductsStore() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE_PATH)) {
      const defaultProducts = getDefaultProducts();
      writeProductsStore(defaultProducts);
      return defaultProducts;
    }

    const raw = fs.readFileSync(PRODUCTS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.products)) {
      return parsed.products;
    }
    return getDefaultProducts();
  } catch (error) {
    console.warn('Unable to read products store, using defaults:', error.message);
    return getDefaultProducts();
  }
}

function writeProductsStore(products) {
  try {
    fs.mkdirSync(path.dirname(PRODUCTS_FILE_PATH), { recursive: true });
    const payload = {
      updatedAt: new Date().toISOString(),
      products: Array.isArray(products) ? products : []
    };
    fs.writeFileSync(PRODUCTS_FILE_PATH, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Unable to write products store:', error.message);
  }
}

function serveHtmlPage(req, res, next) {
  const pageName = req.params.page;
  const pagePath = path.join(__dirname, `${pageName}.html`);

  if (fs.existsSync(pagePath)) {
    return res.sendFile(pagePath);
  }

  next();
}

app.get('/:page.html', (req, res) => {
  res.redirect(`/${req.params.page}/`);
});

app.get('/:page', serveHtmlPage);
app.get('/:page/', serveHtmlPage);
app.use(express.static(path.join(__dirname)));

// Razorpay integration: verify payment status using server-side secret
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const fetchImpl = globalThis.fetch || require('node-fetch');

function authMiddleware(req, res, next) {
  // TODO: Replace this with real authentication using session cookies,
  // JWTs, Supabase auth, or another auth provider.
  req.user = { id: 'user_1' };
  next();
}

function hasPurchasedProduct(userId, productId) {
  return userPurchases[userId] && userPurchases[userId].has(productId);
}

app.get('/api/products', (req, res) => {
  const products = readProductsStore();
  res.json({ success: true, products, updatedAt: new Date().toISOString() });
});

app.post('/api/products', (req, res) => {
  const products = Array.isArray(req.body?.products) ? req.body.products : [];
  writeProductsStore(products);
  res.json({ success: true, products, updatedAt: new Date().toISOString() });
});

app.post('/api/generate-preview', authMiddleware, (req, res) => {
  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ error: 'Missing productId' });
  }

  if (!hasPurchasedProduct(req.user.id, productId)) {
    return res.status(403).json({ error: 'Not purchased' });
  }

  const token = jwt.sign({ userId: req.user.id, productId }, SECRET, { expiresIn: '5m' });
  res.json({ url: `/preview?token=${token}` });
});

app.get('/preview', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(401).send('Preview token is required.');
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    const netlifyUrl = productLinks[String(decoded.productId)];

    if (!netlifyUrl) {
      return res.status(404).send('Preview destination not found.');
    }

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Secure Preview</title>
  <style>
    body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
    iframe { width: 100%; height: 100%; border: 0; }
    .message { color: #fff; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <iframe src="${netlifyUrl}" title="Secure Preview"></iframe>
</body>
</html>
    `);
  } catch (err) {
    res.status(401).send('Link expired. Go back and click Preview again.');
  }
});

app.post('/api/verify-payment', authMiddleware, async (req, res) => {
  const { payment_id, plan, email } = req.body || {};
  if (!payment_id) return res.status(400).json({ error: 'Missing payment_id' });

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(501).json({ error: 'Razorpay not configured on server.' });
  }

  try {
    const url = `https://api.razorpay.com/v1/payments/${encodeURIComponent(payment_id)}`;
    const resp = await fetchImpl(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ error: 'Error verifying payment', details: text });
    }

    const data = await resp.json();
    // Razorpay payment statuses: created, authorized, captured, failed, refunded
    if (data.status === 'captured' || data.status === 'authorized') {
      // mark purchased for demo user
      const userId = req.user.id;
      userPurchases[userId] = userPurchases[userId] || new Set();
      // map plan to a pseudo product id for demo purposes
      const productId = `plan_${String(plan || 'basic')}`.toUpperCase();
      userPurchases[userId].add(productId);
      return res.json({ ok: true, status: data.status, productId });
    }

    return res.status(400).json({ ok: false, status: data.status });
  } catch (err) {
    console.error('verify-payment error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use. Retrying on ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    console.error('Server error:', err);
    process.exit(1);
  });
}

startServer(DEFAULT_PORT);
