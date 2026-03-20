# Auditoría PARTTH — Marzo 2026

## Resumen ejecutivo

| Área | Estado | Acción |
|------|--------|--------|
| Frontend / UX | ✅ OK | — |
| PayPal | ✅ OK | Client ID actualizado, webhook en partth.com |
| Supabase | ⚠️ Ajustes | clients.email unique añadido |
| Seguridad | ⚠️ Revisar | RLS permisivo en varias tablas |
| Deploy | ✅ OK | GitHub → Cloudflare Pages automático |

---

## 1. Frontend y flujos

### Funcional
- **Navegación**: `goPage()`, rutas SPA, meta tags dinámicos
- **PayPal**: SDK con Client ID correcto, cola de render, fallback mailto
- **Auth**: Google OAuth con PKCE, `exchangeCodeForSession`
- **Chat IA**: `agent-chat` con manejo de errores
- **i18n**: ES/EN, tema oscuro/claro
- **Formulario cotización**: tipo, nombre, ciudad, email, notas

### Corregido
- **clients.upsert**: No existía `UNIQUE` en `email` → migración añadida para que `onConflict:'email'` funcione.

---

## 2. PayPal y pagos

### Configuración actual
- **Client ID**: `AQ4CKiYKjEonHn3HykcSiOGoBwRrZ8FTkJ7pFN0FRaN2gtrPy_KREVlJ1wQ59HEdrokbUYzgZH4QyeXy`
- **Webhook URL**: `https://partth.com/api/paypal/webhook`
- **Webhook ID**: `56S73267TA733483A`
- **Flujo**: Cloudflare Pages Function → Supabase `paypal-webhook`

### Flujo de pago
1. Usuario llena formulario → `saveProjectData()` guarda en `clients`
2. Clic en PayPal → `createOrder` con `custom_id: {type, amount}`
3. `onApprove` → `capture` → alerta de éxito
4. PayPal envía webhook a partth.com/api/paypal/webhook
5. Proxy reenvía a Supabase → log en `system_activity_log` (commitment/planes)

### Verificar en PayPal Developer
- [ ] Webhook URL = `https://partth.com/api/paypal/webhook`
- [ ] Evento = `PAYMENT.CAPTURE.COMPLETED`
- [ ] App en modo **Live** (no Sandbox)

---

## 3. Supabase

### Tablas principales
| Tabla | Filas | Uso |
|-------|-------|-----|
| clients | 0 | Formulario cotización |
| projects | 120 | Proyectos abiertos/claimed |
| system_activity_log | 316 | Log de pagos y eventos |
| intent_conversations | 0 | Emails CTA |
| purchases | 0 | Compras de proyectos |

### Edge Functions activas
- `paypal-webhook` (verify_jwt: false) — recibe pagos
- `agent-chat` (verify_jwt: false) — chat IA
- `send-emails`, `shovels-ingest`, `revenue-engine`, etc.

### Advertencias de seguridad (Supabase Advisors)
- **RLS permisivo**: `clients`, `intent_conversations`, `projects` con `WITH CHECK (true)` para anon
- **Leaked password protection**: Desactivado en Auth
- **spatial_ref_sys**: RLS deshabilitado (tabla PostGIS)

[Remediation: Security](https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy)

---

## 4. Deploy e infraestructura

### GitHub Actions
- **Workflow**: `Deploy to Cloudflare Pages`
- **Trigger**: push a `main`, workflow_dispatch
- **Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`

### Cloudflare
- **Pages**: directorio `files/`
- **Functions**: `files/functions/api/paypal/webhook.js`
- **Dominio**: partth.com

---

## 5. Checklist post-auditoría

- [x] Migración `clients_email_key` para upsert por email
- [ ] Configurar webhook en PayPal Developer (URL partth.com)
- [ ] Activar Leaked Password Protection en Supabase Auth
- [ ] Revisar políticas RLS en tablas sensibles (opcional, según riesgo)

---

## 6. Próximos pasos recomendados

1. **Probar pago real**: Hacer una transacción de prueba en partth.com
2. **Revisar logs**: `system_activity_log` y Edge Function logs en Supabase
3. **ANTHROPIC_API_KEY**: Confirmar que está en Supabase Secrets para `agent-chat`
