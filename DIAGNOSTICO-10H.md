# Diagnóstico PARTTH — 10 horas

**Fecha:** 2026-03-18

---

## 📊 Estado actual

| Métrica | Valor |
|---------|-------|
| Clientes (formulario cotización) | **0** |
| Intents (email CTA) | **0** |
| Pagos commitment_fees | **0** |
| Pagos en system_activity_log | **0** |
| Proyectos abiertos | 120 (generados por content-engine) |
| Proyectos vendidos | 0 |

---

## ✅ Lo que SÍ funciona

- **Supabase** — Conectado, 76 requests últimas 24h
- **revenue-engine** — 200 OK, genera contenido
- **auto-publisher** — 200 OK
- **health_check** — Cada 15 min, 120 proyectos activos

---

## 🔴 Fallos detectados (corregidos / pendientes)

### 1. PayPal Webhook — **CORREGIDO**
- **Problema:** PayPal envía GET para verificar la URL → devolvía 500
- **Solución:** Añadido `if(req.method==='GET') return 200`
- **Acción:** En PayPal Developer, **re-verifica el webhook** (o añade de nuevo si falló)

### 2. send-emails — **500 cada hora**
- **Causa:** `RESEND_API_KEY` no configurado o inválido
- **Acción:** Supabase → Project Settings → Edge Functions → Secrets → Añadir `RESEND_API_KEY`
- **Obtener key:** [resend.com](https://resend.com) → API Keys

### 3. shovels-ingest — **500**
- **Causa:** Probable error en la función o dependencia externa
- **Impacto:** No ingesta permisos TX automáticamente

---

## 🚨 Bloqueador principal: CERO tráfico a conversión

**No hay clientes ni intents** = nadie está llegando al formulario de cotización o al CTA de email.

### Posibles causas

1. **⚠️ CRÍTICO: 7 commits NO están en `main`** — Todo el trabajo (PayPal unificado, RLS clients, políticas, etc.) está en `cursor/botones-de-pago-paypal-2d46`. El deploy de Cloudflare corre solo en push a `main`. **Hay que hacer merge a main.**
2. **Dominio** — ¿partth.com apunta al deploy correcto?
3. **Tráfico** — Sin visitas no hay conversiones
4. **SEO** — Páginas recientes, Google puede tardar en indexar

### Acciones para generar ingresos YA

1. **Tráfico de pago** — Meta Ads (FB/Instagram) con el Pixel ya instalado
2. **Verificar deploy** — Abre https://partth.com y prueba el flujo completo
3. **Merge a main** — Si trabajas en rama, haz merge para que se despliegue
4. **Re-verificar PayPal Webhook** — Tras el fix, PayPal debe poder verificar

---

## Checklist inmediato

- [ ] Merge rama a `main` (si aplica)
- [ ] Verificar https://partth.com carga y el botón PayPal funciona
- [ ] Añadir `RESEND_API_KEY` en Supabase Edge Functions
- [ ] Re-verificar webhook en PayPal Developer
- [ ] Lanzar campaña Meta Ads (tráfico cualificado)
