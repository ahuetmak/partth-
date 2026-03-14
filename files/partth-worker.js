// PARTTH — Cloudflare Worker
// Sirve index.html, sitemap.xml, robots.txt y páginas SEO de ciudad/servicio

const SUPABASE_URL = 'https://ptfsjqsckjqamaiagidj.supabase.co';

// ═══ ROBOTS.TXT ═══════════════════════════════════════════════
const ROBOTS = `User-agent: *
Allow: /
Sitemap: https://partth.com/sitemap.xml
Disallow: /api/
Disallow: /admin/`;

// ═══ SITEMAP.XML ══════════════════════════════════════════════
function buildSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    ['/', '1.0', 'daily'],
    ['/houston', '0.9', 'daily'],
    ['/dallas', '0.9', 'daily'],
    ['/austin', '0.9', 'daily'],
    ['/san-antonio', '0.9', 'daily'],
    ['/fort-worth', '0.8', 'weekly'],
    ['/plano', '0.7', 'weekly'],
    ['/el-paso', '0.7', 'weekly'],
    ['/irving', '0.7', 'weekly'],
    ['/pintura-residencial', '0.9', 'weekly'],
    ['/pintura-comercial', '0.9', 'weekly'],
    ['/demolicion-residencial', '0.9', 'weekly'],
    ['/demolicion-comercial', '0.9', 'weekly'],
  ].map(([loc, priority, changefreq]) =>
    `  <url><loc>https://partth.com${loc}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

// ═══ SEO PAGE GENERATOR ═══════════════════════════════════════
const CITY_DATA = {
  houston:       { name: 'Houston',       pop: '2.3M', zip: '77002' },
  dallas:        { name: 'Dallas',        pop: '1.3M', zip: '75201' },
  austin:        { name: 'Austin',        pop: '978K', zip: '78701' },
  'san-antonio': { name: 'San Antonio',   pop: '1.5M', zip: '78201' },
  'fort-worth':  { name: 'Fort Worth',    pop: '935K', zip: '76101' },
  plano:         { name: 'Plano',         pop: '285K', zip: '75075' },
  'el-paso':     { name: 'El Paso',       pop: '678K', zip: '79901' },
  irving:        { name: 'Irving',        pop: '256K', zip: '75062' },
};

const SERVICE_DATA = {
  'pintura-residencial':  { name: 'Pintura Residencial', desc: 'interior y exterior de casas y residencias' },
  'pintura-comercial':    { name: 'Pintura Comercial',   desc: 'oficinas, locales, bodegas y espacios comerciales' },
  'demolicion-residencial': { name: 'Demolición Residencial', desc: 'casas, garajes y estructuras residenciales' },
  'demolicion-comercial': { name: 'Demolición Comercial', desc: 'bodegas, edificios y estructuras comerciales' },
};

function seoPage(title, description, h1, h2, body) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${description}"/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="https://partth.com${body.path}"/>
<link rel="sitemap" type="application/xml" href="https://partth.com/sitemap.xml"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${description}"/>
<meta property="og:url" content="https://partth.com${body.path}"/>
<style>
body{margin:0;background:#04040a;color:#fff;font-family:Arial,sans-serif}
nav{background:rgba(4,4,10,.95);border-bottom:1px solid rgba(255,255,255,.07);padding:18px 40px;display:flex;justify-content:space-between;align-items:center}
.logo{font-weight:800;font-size:20px;text-decoration:none;color:#fff;letter-spacing:.05em}
.logo em{color:#F5A623;font-style:normal}
.cta{background:#F5A623;color:#000;padding:10px 24px;border-radius:100px;font-size:13px;font-weight:700;text-decoration:none}
.hero{max-width:900px;margin:0 auto;padding:100px 24px 60px;text-align:center}
h1{font-size:clamp(32px,5vw,58px);font-weight:800;margin-bottom:16px;line-height:1.05}
.sub{font-size:18px;color:rgba(255,255,255,.5);line-height:1.65;margin-bottom:40px;max-width:600px;margin-left:auto;margin-right:auto}
.content{max-width:900px;margin:0 auto;padding:0 24px 80px}
h2{font-size:clamp(24px,4vw,36px);font-weight:800;margin-bottom:20px;color:#F5A623}
p{color:rgba(255,255,255,.6);line-height:1.7;margin-bottom:16px}
.back{color:rgba(255,255,255,.4);text-decoration:none;font-size:13px}
.back:hover{color:#fff}
footer{border-top:1px solid rgba(255,255,255,.06);padding:24px 40px;text-align:center;font-size:11px;color:rgba(255,255,255,.2)}
</style>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","name":"PARTTH","url":"https://partth.com","description":"${description}","areaServed":{"@type":"City","name":"${body.cityName || 'Texas'}"},"serviceType":["${body.serviceType || 'Construction'}"],"telephone":"","email":"support@partth.com"}
</script>
</head>
<body>
<nav>
  <a href="/" class="logo">PART<em>TH</em></a>
  <a href="/" class="cta">Solicitar Cotización →</a>
</nav>
<div class="hero">
  <h1>${h1}</h1>
  <p class="sub">${description}</p>
  <a href="/" class="cta" style="display:inline-block;padding:16px 36px;font-size:15px">Solicitar Cotización ($50) →</a>
</div>
<div class="content">
  <h2>${h2}</h2>
  ${body.content}
  <br/><a href="/" class="back">← Volver a PARTTH</a>
</div>
<footer>© 2026 PARTTH · support@partth.com · Pintura y Demolición · Texas</footer>
</body>
</html>`;
}

// ═══ MAIN HANDLER ════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    // robots.txt
    if (path === '/robots.txt') {
      return new Response(ROBOTS, {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' }
      });
    }

    // sitemap.xml
    if (path === '/sitemap.xml') {
      return new Response(buildSitemap(), {
        headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=86400' }
      });
    }

    // Ciudad SEO pages: /houston, /dallas, etc.
    const citySlug = path.slice(1);
    if (CITY_DATA[citySlug]) {
      const city = CITY_DATA[citySlug];
      return new Response(seoPage(
        `Contratistas de Pintura y Demolición en ${city.name}, TX | PARTTH`,
        `Los mejores contratistas de pintura y demolición en ${city.name}, Texas. Cotizaciones verificadas con garantía. Solicita hoy con solo $50 de compromiso.`,
        `Pintura y Demolición en ${city.name}, Texas`,
        `¿Por qué PARTTH en ${city.name}?`,
        {
          path,
          cityName: city.name,
          serviceType: 'Painting Contractor, Demolition Contractor',
          content: `
<p>PARTTH conecta propietarios y empresas en <strong>${city.name}</strong> con los mejores contratistas verificados de pintura y demolición en Texas.</p>
<p>Con más de <strong>${city.pop} habitantes</strong>, ${city.name} es uno de los mercados de construcción más activos de Texas. PARTTH garantiza que cada cotización que recibes viene de un profesional con experiencia comprobada.</p>
<p><strong>¿Cómo funciona?</strong> Pagas $50 de cuota de compromiso, y un contratista verificado en ${city.name} te contacta en 24-48 horas. Si lo contratas, los $50 se descuentan de la factura final.</p>
<p>Servicios en ${city.name}: pintura interior, pintura exterior, demolición residencial, demolición comercial, y más.</p>
`
        }
      ), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'public, max-age=3600' }
      });
    }

    // Servicio SEO pages: /pintura-residencial, /demolicion-comercial, etc.
    const serviceSlug = path.slice(1);
    if (SERVICE_DATA[serviceSlug]) {
      const svc = SERVICE_DATA[serviceSlug];
      return new Response(seoPage(
        `${svc.name} en Texas | Contratistas Verificados | PARTTH`,
        `Encuentra contratistas verificados de ${svc.name.toLowerCase()} en Texas. Proyectos de ${svc.desc}. Cotización garantizada en 24h desde $50.`,
        `${svc.name} en Texas`,
        `Contratistas especializados en ${svc.name}`,
        {
          path,
          cityName: 'Texas',
          serviceType: svc.name,
          content: `
<p>PARTTH conecta clientes en Texas con los mejores contratistas de <strong>${svc.name.toLowerCase()}</strong> en todo el estado.</p>
<p>Especialistas en ${svc.desc}, verificados y con historial comprobado en Houston, Dallas, Austin, San Antonio y los 254 condados de Texas.</p>
<p><strong>¿Cómo funciona?</strong> Pagas una cuota de compromiso de $50, el contratista recibe $40 por su tiempo, y te contacta en 24-48 horas con una cotización profesional. Si contratas, el $50 se descuenta de la factura.</p>
<p>Sin contratos forzados. Sin leads falsos. Solo profesionales verificados en Texas.</p>
`
        }
      ), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'public, max-age=3600' }
      });
    }

    // Default: proxy to Cloudflare Pages (index.html)
    // Si tienes Pages, cambia la URL aquí:
    // return fetch('https://partth.pages.dev' + path, request);

    // Por ahora: redirigir a Pages o servir desde KV
    return Response.redirect('https://partth.pages.dev' + path, 301);
  }
};
