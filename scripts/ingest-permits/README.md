# Ingest Permits → raw_signals

Script que extrae permisos de Dallas y Austin y los inserta en `raw_signals`.

## APIs

- **Dallas**: https://www.dallasopendata.com/resource/e7gq-4sah.json
- **Austin**: https://data.austintexas.gov/resource/3syk-w9eu.json

## Uso local

```bash
cd scripts/ingest-permits
cp .env.example .env
# Editar .env con SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API)
npm install
npm run ingest
```

## Dry run (sin insertar)

```bash
DRY_RUN=1 npm run ingest
```

## CRON (GitHub Actions)

El workflow `.github/workflows/ingest-permits.yml` ejecuta el script diariamente a las 9:00 UTC.

Secrets requeridos en GitHub:
- `SUPABASE_SERVICE_ROLE_KEY`

## CRON manual (VPS / servidor)

```cron
0 9 * * * cd /ruta/partth/scripts/ingest-permits && npm run ingest
```
