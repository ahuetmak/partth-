# Setup B2B Lead Gen System

Sistema serverless: Apify → SerpApi → MillionVerifier → Match → Resend → PayPal.

## 1. Supabase (ya aplicado)

Migración `b2b_lead_gen_tables` creó:
- `b2b_leads`
- `b2b_contractors`
- `b2b_transactions`
- Índices en zip_code, city, main_category

## 2. Cloudflare Worker

```bash
cd workers/lead-gen
npm install
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SERPAPI_KEY
npx wrangler secret put MILLION_VERIFIER_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler deploy
```

Base pública única: `https://partth.com`.

## 3. Apify

En tu Actor de Apify → Webhooks:
- URL: `https://partth.com/api/apify-webhook`
- Método: POST
- Payload esperado: `main_category`, `sub_service`, `zip_code`, `prospect_name`, `prospect_phone`, `prospect_email`, `city`

## 4. PayPal

1. Crear app en developer.paypal.com
2. Webhooks → Add Webhook
3. URL: `https://partth.com/api/paypal/webhook`
4. Evento: `PAYMENT.CAPTURE.COMPLETED`
5. Secret en Worker: `wrangler secret put PAYPAL_WEBHOOK_SECRET`
6. Webhook ID: `wrangler secret put PAYPAL_WEBHOOK_ID`

## 5. Credenciales necesarias

| Variable | Dónde obtenerla |
|----------|----------------|
| SERPAPI_KEY | serpapi.com |
| MILLION_VERIFIER_KEY | millionverifier.com |
| RESEND_API_KEY | resend.com |
| PAYPAL_CLIENT_ID/SECRET | developer.paypal.com |
| SUPABASE_SERVICE_ROLE_KEY | Supabase Dashboard → Settings → API |

## 6. Formato webhook Apify

```json
{
  "main_category": "residential",
  "sub_service": "hvac_ac_repair",
  "zip_code": "77002",
  "city": "Houston",
  "prospect_name": "John Doe",
  "prospect_phone": "+1234567890",
  "prospect_email": "john@example.com"
}
```

## 7. Matriz de precios

Ver `workers/lead-gen/src/index.js` → `PRICING_MATRIX`. Incluye residential, commercial, permits con sub-servicios.
