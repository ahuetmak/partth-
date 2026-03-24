# ACCIÓN INMEDIATA — PARTTH B2B

## ✅ HECHO (por mí, ahora mismo)

1. **13 contratistas cargados** en `b2b_contractors` (Houston, Dallas, Austin, Fort Worth, Frisco, San Antonio)
2. **5 leads en cola** en `b2b_leads` (status: queued) — Houston, Dallas, Austin, Fort Worth, Frisco

El cron del Worker (cada 5 min) procesará esos leads, enviará emails con PayPal a los contratistas en cada zona y ellos podrán comprar.

---

## LO QUE TIENES QUE HACER (una sola vez)

### 1. Desplegar el Worker

```bash
cd workers/lead-gen
npm install
npx wrangler deploy
```

(O mergea a main — el workflow lo despliega automático si tienes `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` en GitHub Secrets)

### 2. Configurar el Webhook de PayPal para B2B

PayPal tiene **2 webhooks distintos**:
- Uno para el sistema de proyectos (partth.com) → ya configurado
- Otro para **B2B Lead Gen** → hay que añadirlo

**Añade este webhook en PayPal Developer:**
- URL: `https://partth.com/api/paypal/webhook`
- Eventos: `PAYMENT.CAPTURE.COMPLETED`

### 3. Configurar Apify (cuando lo tengas)

URL del webhook: `https://partth.com/api/apify-webhook`

Hasta entonces, los leads pueden entrar manualmente o por script.

---

## CÓMO PROBAR QUE FUNCIONA

1. Espera 5–10 min (cron procesa la cola)
2. Revisa inbox de los contratistas (info@bhctx.com, projects@txbuiltconstruction.com, etc.) — deben recibir email con botón PayPal
3. Cuando uno pague, se registrará en `b2b_transactions` y recibirá los datos del lead

---

## RESUMEN DE ESTADO

| Componente | Estado |
|------------|--------|
| Contratistas | ✅ 13 en base |
| Leads en cola | ✅ 5 listos |
| Worker desplegado | ⏳ Tú lo despliegas |
| PayPal webhook B2B | ⏳ Tú lo configuras |
| Apify | ⏳ Cuando lo tengas |
