# Reporte Growth Agent — Houston & Dallas

## 1. Disparo manual Run #2

**Comando para ejecutar:**

```bash
curl -X POST https://TU-WORKER-URL.workers.dev/api/growth-agent
```

Reemplaza `TU-WORKER-URL` por tu URL real (ej. `lead-gen.tu-cuenta`).

Alternativa con npm:
```bash
cd workers/lead-gen && npm run growth-run
```
(Ajusta la URL en package.json si es necesario)

---

## 2. Auditoría de APIs (Rate Limits)

| API | Manejo 429 | Acción |
|-----|------------|--------|
| **OpenAI** | ✅ Reintentos con backoff | `Retry-After` o 5s, máx 3 intentos |
| **MillionVerifier** | ✅ Sleep 2s en 429, 3 intentos | No detiene flujo |
| **Resend** | ✅ Detecta 429 | Sleep 2s adicional antes del siguiente correo |
| **SerpApi** | ✅ `retryWithBackoff` existente | Backoff exponencial |

**Delays:** 400ms entre correos normal. +2000ms si Resend devuelve 429.

---

## 3. Monitoreo b2b_contractors

```sql
SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '15 minutes') as ultimos_15min
FROM b2b_contractors WHERE source = 'ai_hunter_v1';
```

**Última consulta:** 0 prospectos con source='ai_hunter_v1' (tabla vacía o sin corridas aún).

---

## 4. Control de calidad — Últimos 5 pitches

```sql
SELECT city, specialty, leads_in_city, pitch, created_at
FROM growth_agent_sends
ORDER BY created_at DESC
LIMIT 5;
```

La tabla `growth_agent_sends` registra cada correo enviado con ciudad, especialidad, leads en zona y pitch completo. Revisar tras Run #2.

**Prompt GPT-4o:** Incluye instrucción explícita de mencionar ciudad y número de oportunidades. Tono: humano ocupado, equipo Inteligencia Partth.

---

## 5. Orden de ciudades (prioridad Houston/Dallas)

Las 20 ciudades se procesan en este orden — Houston y Dallas primero:
1. Houston, 2. Dallas, 3. Austin, 4. San Antonio, 5. Fort Worth...

---

## Estado actual

- **Código:** Rate limits manejados, logging de pitches, prompt afinado
- **Tabla:** `growth_agent_sends` creada para auditoría
- **Run #2:** Ejecutar manualmente con curl (Worker debe estar desplegado y con secrets)
