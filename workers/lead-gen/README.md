# B2B Lead Gen Worker

Sistema serverless de generación y venta automática de leads. Cloudflare Workers + Supabase. Operación estatal de alto volumen.

## Flujo

1. **Apify webhook** → Recibe prospecto (nombre, email, teléfono, zip, categoría, sub_servicio)
2. **Match** → Busca contratistas en Supabase por zip + categoría (índices optimizados)
3. **Autollenado** → Si hay 0 contratistas, dispara SerpApi → MillionVerifier → guarda en Supabase
4. **Ingesta alternativa** → `POST /api/apify-contractors` acepta formato emails[] + facebookProfiles[]
5. **Email** → Resend envía oferta a cada contratista con enlace PayPal único (precio según PRICING_MATRIX)
6. **PayPal webhook** → Al confirmar pago: status "sold" + email con datos del lead al comprador

## Despliegue

```bash
cd workers/lead-gen
npm install -g wrangler
wrangler login
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SERPAPI_KEY
wrangler secret put MILLION_VERIFIER_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_CLIENT_SECRET
wrangler deploy
```

## Endpoints

- `POST /api/apify-webhook` — Recibe datos de Apify (leads)
- `POST /api/apify-contractors` — Ingesta contractors desde Apify (emails + facebookProfiles)
- `POST /api/paypal-webhook` — Recibe confirmación de pago PayPal
- `GET /health` — Health check

## Control de concurrencia (alto volumen)

Variables opcionales (`wrangler secret put` o `.dev.vars`):

- `USE_QUEUE=true` — Webhook retorna 202, cron procesa cola cada 5 min
- `QUEUE_BATCH_SIZE=5` — Leads por ejecución del cron
- `DELAY_BETWEEN_CONTRACTORS=500` — ms entre emails/APIs externas

## Tablas Supabase

- `b2b_leads` — Prospectos (status: new, queued, emails_sent, sold)
- `b2b_contractors` — Contratistas validados (índices zip_code, city, main_category)
- `b2b_transactions` — Ventas completadas

## Webhooks

1. **Apify**: `https://lead-gen.xxx.workers.dev/api/apify-webhook`
2. **PayPal**: `https://lead-gen.xxx.workers.dev/api/paypal-webhook`
