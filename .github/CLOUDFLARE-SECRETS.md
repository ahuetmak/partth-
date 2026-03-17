# Secrets para GitHub → Cloudflare

Añade estos secrets en **GitHub** → Repo → Settings → Secrets and variables → Actions:

| Secret | Dónde obtenerlo |
|--------|-----------------|
| `CLOUDFLARE_API_TOKEN` | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → **Edit Cloudflare Workers** + **Edit Cloudflare Pages** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → Workers & Pages → Overview → Account ID (lado derecho) |

**Project name:** Si tu proyecto en Cloudflare Pages no se llama `partth`, edita `.github/workflows/deploy-cloudflare.yml` y cambia `projectName`.
