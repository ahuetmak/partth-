// Supabase Edge Function — paypal-webhook
// Handles PayPal webhook verification (GET) and payment capture events (POST)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // PayPal uses GET to verify the webhook URL is reachable
  if (req.method === 'GET') {
    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // TODO: verify PayPal webhook signature using PAYPAL-TRANSMISSION-SIG
    // header and PayPal's /v1/notifications/verify-webhook-signature API
    // before processing payment events in production.
    const body = await req.json();
    const eventType: string = body?.event_type ?? '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Log every incoming webhook event
    await supabase.from('system_activity_log').insert({
      event: eventType,
      source: 'paypal-webhook',
      payload: body,
    });

    // Handle successful payment capture
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const resource = body?.resource ?? {};
      const customId: string = resource?.custom_id ?? '{}';
      const captureId: string = resource?.id ?? '';
      const orderId: string = resource?.supplementary_data?.related_ids?.order_id ?? '';
      const amountValue: string = resource?.amount?.value ?? '0';
      const currency: string = resource?.amount?.currency_code ?? 'USD';

      let paymentType = 'commitment';
      let paymentAmount = parseFloat(amountValue);

      try {
        const ctx = JSON.parse(customId);
        if (ctx.type) paymentType = ctx.type;
        if (ctx.amount) paymentAmount = parseFloat(ctx.amount);
      } catch {
        // custom_id not JSON — use defaults
      }

      await supabase.from('payments').upsert(
        {
          paypal_order_id: orderId || captureId,
          paypal_capture_id: captureId,
          type: paymentType,
          amount: paymentAmount,
          currency,
          status: 'completed',
          metadata: resource,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'paypal_order_id' },
      );
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('paypal-webhook error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
