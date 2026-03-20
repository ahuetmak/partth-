// PARTTH — Proxy PayPal webhook a Supabase
// URL: https://partth.com/api/paypal/webhook
// Webhook ID PayPal: 56S73267TA733483A

const SUPABASE_WEBHOOK = 'https://ptfsjqsckjqamaiagidj.supabase.co/functions/v1/paypal-webhook';

export async function onRequestPost(context) {
  try {
    const body = await context.request.text();
    const headers = new Headers();
    context.request.headers.forEach((v, k) => {
      if (!['host', 'cf-'].some(p => k.toLowerCase().startsWith(p))) {
        headers.set(k, v);
      }
    });
    headers.set('Content-Type', 'application/json');
    const res = await fetch(SUPABASE_WEBHOOK, {
      method: 'POST',
      headers,
      body,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestGet() {
  return new Response('OK', { status: 200 });
}
