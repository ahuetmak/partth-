# B2B Lead Gen Worker

Sistema serverless de generación y venta automática de leads. Cloudflare Workers + Supabase.

## Flujo

1. **Apify webhook** → Recibe prospecto (nombre, email, teléfono, zip, categoría)
2. **Match** → Busca contratistas en Supabase por zip + categoría
3. **Autollenado** → Si hay 0 contratistas, dispara SerpApi → MillionVerifier → guarda en Supabase
4. **Email** → Resend envía oferta a cada contratista con enlace PayPal único
5. **PayPal webhook** → Al confirmar pago: status "Vendido" + email con datos del lead al comprador

## Despliegue

```bash
cd workers/lead-gen
npm install -g wrangler
wrangler login
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SERPAPI_KEY
wrangler secret put MILLION_VERIFIER_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_CLIENT_SECRET
wrangler deploy
```

## Endpoints

- `POST /api/apify-webhook` — Recibe datos de Apify
- `POST /api/paypal-webhook` — Recibe confirmación de pago PayPal
- `GET /health` — Health check

## Tablas Supabase

- `b2b_leads` — Prospectos de Apify
- `b2b_contractors` — Contratistas validados (SerpApi + MillionVerifier)
- `b2b_transactions` — Ventas completadas

## Webhooks a configurar

1. **Apify**: URL = `https://lead-gen.tu-subdominio.workers.dev/api/apify-webhook`
2. **PayPal**: URL = `https://lead-gen.tu-subdominio.workers.dev/api/paypal-webhook`
