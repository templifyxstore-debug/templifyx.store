const DEFAULT_SUPABASE_URL = 'https://vrhtmoovtnslxvqxvmmi.supabase.co';

function json(body, status = 200) {
  return Response.json(body, { status });
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Payment provider returned an invalid response.');
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return json({ error: 'Razorpay is not configured for checkout.' }, 503);
    }
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.CHECKOUT_ORDERS) {
      return json({ error: 'Secure checkout is not configured.' }, 503);
    }

    const body = await request.json();
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return json({ error: 'At least one cart item is required.' }, 400);
    }

    const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const catalogResponse = await fetch(`${supabaseUrl}/rest/v1/products?select=id,product_id,name,price`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    const catalog = await readResponse(catalogResponse);
    if (!catalogResponse.ok || !Array.isArray(catalog)) {
      console.error('Unable to load product catalog:', catalog);
      return json({ error: 'Unable to validate cart prices. Please try again later.' }, 502);
    }

    let subtotalMinor = 0;
    const items = [];
    for (const requested of body.items) {
      const id = String(requested?.id || '');
      const quantity = Number(requested?.quantity);
      if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return json({ error: 'The cart contains an invalid item or quantity.' }, 400);
      }
      const product = catalog.find(item => String(item.product_id || item.id) === id);
      const price = Number(product?.price);
      if (!product || !Number.isFinite(price) || price < 0) {
        return json({ error: `Product ${id} is not available for checkout.` }, 400);
      }

      subtotalMinor += Math.round(price * 100) * quantity;
      items.push({ id, name: product.name, price, quantity });
    }

    if (subtotalMinor <= 0) return json({ error: 'The cart does not contain paid items.' }, 400);

    const currency = String(env.RAZORPAY_PRODUCT_CURRENCY || 'USD').toUpperCase();
    const amount = subtotalMinor + Math.round(subtotalMinor * 0.1);
    const authorization = `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`;
    const referenceId = `tx_${crypto.randomUUID().replaceAll('-', '')}`;
    const callbackUrl = new URL('/api/razorpay-callback', request.url).toString();
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        accept_partial: false,
        reference_id: referenceId,
        description: `TemplifyX purchase: ${items.map(item => item.name).join(', ').slice(0, 180)}`,
        callback_url: callbackUrl,
        callback_method: 'get',
        expire_by: Math.floor(Date.now() / 1000) + 1800,
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { product_ids: items.map(item => item.id).join(',') }
      })
    });
    const paymentLink = await readResponse(razorpayResponse);
    if (!razorpayResponse.ok) {
      console.error('Razorpay payment link creation failed:', paymentLink);
      return json({ error: 'Unable to create a Razorpay payment link.' }, 502);
    }
    if (
      !paymentLink.id ||
      !paymentLink.short_url ||
      paymentLink.reference_id !== referenceId ||
      paymentLink.amount !== amount ||
      paymentLink.currency !== currency
    ) {
      console.error('Razorpay returned unexpected payment link details:', paymentLink);
      return json({ error: 'Razorpay returned an invalid payment link.' }, 502);
    }

    await env.CHECKOUT_ORDERS.put(referenceId, JSON.stringify({
      referenceId,
      paymentLinkId: paymentLink.id,
      items,
      amount,
      currency
    }), {
      expirationTtl: 1800
    });
    return json({
      id: paymentLink.id,
      reference_id: referenceId,
      payment_url: paymentLink.short_url,
      amount: paymentLink.amount,
      currency: paymentLink.currency
    });
  } catch (error) {
    console.error('Create Razorpay payment link failed:', error);
    return json({ error: 'Unable to start checkout. Please try again.' }, 500);
  }
}