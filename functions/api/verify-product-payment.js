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

async function isValidSignature(paymentLinkId, referenceId, status, paymentId, signature, secret) {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${paymentLinkId}|${referenceId}|${status}|${paymentId}`)
  ));
  const supplied = Uint8Array.from(signature.match(/.{2}/g), byte => parseInt(byte, 16));
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ supplied[index];
  }
  return difference === 0;
}

async function getCheckoutOrder(env, referenceId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const order = await env.CHECKOUT_ORDERS.get(referenceId, 'json');
    if (order) return order;
    if (attempt < 7) await new Promise(resolve => setTimeout(resolve, 250));
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.CHECKOUT_ORDERS) {
      return json({ error: 'Secure checkout is not configured.' }, 503);
    }

    const body = await request.json();
    const paymentId = String(body.razorpay_payment_id || '');
    const paymentLinkId = String(body.razorpay_payment_link_id || '');
    const referenceId = String(body.razorpay_payment_link_reference_id || '');
    const linkStatus = String(body.razorpay_payment_link_status || '');
    const signature = String(body.razorpay_signature || '');
    if (!paymentId || !paymentLinkId || !referenceId || !linkStatus || !signature) {
      return json({ error: 'Payment verification details are missing.' }, 400);
    }

    const storedOrder = await getCheckoutOrder(env, referenceId);
    if (!storedOrder) {
      return json({ error: 'The checkout order is missing or expired. If you were charged, contact support.' }, 400);
    }
    if (
      storedOrder.referenceId !== referenceId ||
      storedOrder.paymentLinkId !== paymentLinkId ||
      linkStatus !== 'paid' ||
      !await isValidSignature(paymentLinkId, referenceId, linkStatus, paymentId, signature, env.RAZORPAY_KEY_SECRET)
    ) {
      return json({ error: 'Invalid Razorpay payment signature.' }, 400);
    }

    const authorization = `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`;
    const linkResponse = await fetch(
      `https://api.razorpay.com/v1/payment_links/${encodeURIComponent(paymentLinkId)}`,
      { headers: { Authorization: authorization } }
    );
    const paymentLink = await readResponse(linkResponse);
    if (!linkResponse.ok) {
      console.error('Razorpay payment link lookup failed:', paymentLink);
      return json({ error: 'Unable to verify the Razorpay payment link.' }, 502);
    }
    if (
      paymentLink.id !== paymentLinkId ||
      paymentLink.reference_id !== referenceId ||
      paymentLink.status !== 'paid' ||
      paymentLink.amount !== storedOrder.amount ||
      paymentLink.amount_paid !== storedOrder.amount ||
      paymentLink.currency !== storedOrder.currency
    ) {
      return json({ error: 'The Razorpay payment link is not fully paid for this cart.' }, 409);
    }

    const paymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: authorization } }
    );
    const payment = await readResponse(paymentResponse);
    if (!paymentResponse.ok) {
      console.error('Razorpay payment lookup failed:', payment);
      return json({ error: 'Unable to verify the Razorpay payment.' }, 502);
    }
    if (
      payment.status !== 'captured' ||
      payment.amount !== storedOrder.amount ||
      payment.currency !== storedOrder.currency
    ) {
      return json({ error: 'The payment has not been captured for this cart.' }, 409);
    }

    await env.CHECKOUT_ORDERS.delete(referenceId);
    return json({ ok: true, items: storedOrder.items });
  } catch (error) {
    console.error('Verify checkout payment failed:', error);
    return json({ error: 'Unable to verify payment. If you were charged, contact support.' }, 500);
  }
}
