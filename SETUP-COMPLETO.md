# Checklist: Todo lo que falta para dejar PARTTH funcionando

## ✅ Ya está (no tocar)

| Item | Estado |
|------|--------|
| PayPal Webhook | Configurado en PayPal Developer |
| Meta Pixel | En index.html (ID: 25233196896353797) |
| Eventos FB: PageView, Lead, InitiateCheckout, AddPaymentInfo, Purchase | En código |
| Supabase | Conectado |
| Cloudflare Pages | Deploy automático vía GitHub |

---

## 1. PayPal Webhook (verificar)

**URL que debe estar en PayPal Developer:**
```
https://ptfsjqsckjqamaiagidj.supabase.co/functions/v1/paypal-webhook
```

**Evento:** `PAYMENT.CAPTURE.COMPLETED`

**Dónde:** [developer.paypal.com](https://developer.paypal.com) → Tu app → Webhooks → Add Webhook

---

## 2. N8N — Importar workflows

Tienes 4 JSON en `files/`. Importa cada uno en tu instancia N8N:

| Archivo | Qué hace |
|---------|----------|
| `n8n-1-shovels-diario.json` | Diario 9am: ingest permisos TX → email si hay nuevos |
| `n8n-2-emails-hora.json` | Cada hora: envía emails programados |
| `n8n-3-seo-sitemap.json` | Semanal: ping Google/Bing sitemap |
| `n8n-4-monitor.json` | Cada 15 min: alerta si emails fallan |

**Pasos:**
1. Abre N8N (cloud o self-hosted)
2. Workflows → Import from File → selecciona cada JSON
3. Activa cada workflow (toggle ON)

**Variable de entorno en N8N:**
- `RESEND_API_KEY` — para enviar emails (shovels, monitor, send-emails)

---

## 3. Facebook + Instagram

**El mismo Pixel sirve para ambos.** Ya está en el sitio.

**En Meta Business Suite:**

1. **Verificar dominio**
   - Business Settings → Brand Safety → Domains
   - Añade `partth.com` y verifica (DNS o HTML)

2. **Conectar Pixel a Instagram**
   - Events Manager → Tu Pixel → Settings
   - Asigna el Pixel a tu cuenta de anuncios de Instagram

3. **Eventos de conversión**
   - Lead: cuando hacen clic "Pedir Cotización" o envían email
   - InitiateCheckout: cuando van a cotización
   - AddPaymentInfo: cuando llenan formulario antes de PayPal
   - Purchase: cuando completan pago PayPal

4. **Instagram**
   - Crea campañas en Ads Manager
   - Usa el mismo Pixel para audiencias y conversiones
   - No hace falta código extra

---

## 4. Resend (emails)

Los workflows N8N y la Edge Function `send-emails` usan Resend.

**Variable en Supabase (Edge Function send-emails):**
- `RESEND_API_KEY`

**Variable en N8N:**
- `RESEND_API_KEY`

**Dominio:** Verifica `support@partth.com` en [resend.com](https://resend.com) → Domains

---

## 5. admin@partth.com

Los workflows envían alertas a `admin@partth.com`. Cambia en los JSON si usas otro email:
- n8n-1-shovels-diario.json
- n8n-4-monitor.json

---

## Resumen rápido

| Qué | Dónde | Acción |
|-----|-------|--------|
| PayPal Webhook | PayPal Developer | Verificar URL + evento |
| N8N | n8n.io o self-hosted | Importar 4 JSON, añadir RESEND_API_KEY |
| Meta/FB/Instagram | Business Suite | Verificar dominio, conectar Pixel |
| Resend | resend.com + Supabase | API key, verificar dominio |
