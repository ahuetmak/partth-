# Auditoría Supabase → Cloudflare → PayPal

**Fecha:** 2026-03-17

## ✅ Supabase

| Componente | Estado |
|------------|--------|
| Proyecto partth | ACTIVE_HEALTHY |
| Tablas (clients, intent_conversations, projects, etc.) | OK |
| RLS clients | **Corregido** — añadidas políticas INSERT/SELECT/UPDATE para anon |
| intent_conversations | OK — public_insert permite captura CTA |
| Edge Functions | 18 activas (agent-chat, paypal-webhook, shovels-ingest, etc.) |
| paypal-webhook | **Actualizado** — acepta pagos commitment/plan, retorna 200 |

## ✅ Cloudflare

| Componente | Estado |
|------------|--------|
| Pages proyecto "partth" | Configurado |
| GitHub Action deploy | Direct Upload (files/) |
| Secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | En GitHub |
| Worker partth-worker.js | En repo — operativo para partth.com |
| _redirects | Rutas SEO + legales |
| sitemap.xml (estático) | Actualizado con quien-somos, privacy, terms, cookie |

## ✅ PayPal

| Componente | Estado |
|------------|--------|
| SDK buttons | createOrder dinámico |
| custom_id | Enviado (type, amount) para webhook |
| Webhook URL | Supabase Edge Function paypal-webhook |
| Flujos | Cotización $50, Plan Esencial $75, Plan Profesional $150 |

## ⚠️ Pendientes / Recomendaciones

1. **PayPal Webhook URL** — En el dashboard de PayPal Developer, configura la URL:
   `https://ptfsjqsckjqamaiagidj.supabase.co/functions/v1/paypal-webhook`
   Eventos: `PAYMENT.CAPTURE.COMPLETED`

2. **Worker Cloudflare** — partth-worker.js sirve robots.txt, sitemap, páginas ciudad/servicio. Si partth.com apunta a Pages directamente, el worker no corre. Verifica en Cloudflare si el dominio usa Worker o Pages.

3. **RLS clients** — La política clients_anon_select expone datos. Para producción, migrar a Edge Function con service_role.

4. **spatial_ref_sys** — RLS deshabilitado (tabla PostGIS). Bajo riesgo si no se expone vía API.
