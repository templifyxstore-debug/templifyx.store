function redirectToStorefront(request, callbackData) {
  const returnUrl = new URL('/productpage.html', request.url);
  const callbackFields = [
    'razorpay_payment_id',
    'razorpay_payment_link_id',
    'razorpay_payment_link_reference_id',
    'razorpay_payment_link_status',
    'razorpay_signature'
  ];

  for (const field of callbackFields) {
    const value = callbackData.get(field);
    if (value) returnUrl.searchParams.set(field, String(value));
  }

  if (!returnUrl.searchParams.has('razorpay_payment_id')) {
    returnUrl.searchParams.set('checkout_error', 'Razorpay did not return a completed payment');
  }
  return Response.redirect(returnUrl.toString(), 303);
}

export async function onRequestGet({ request }) {
  const callbackData = new URL(request.url).searchParams;
  return redirectToStorefront(request, callbackData);
}

export async function onRequestPost({ request }) {
  try {
    return redirectToStorefront(request, await request.formData());
  } catch (error) {
    const returnUrl = new URL('/productpage.html', request.url);
    returnUrl.searchParams.set('checkout_error', 'Razorpay returned an unreadable payment response');
    return Response.redirect(returnUrl.toString(), 303);
  }
}
