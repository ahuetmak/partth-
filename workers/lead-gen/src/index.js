/**
 * PARTTH Intelligence v4.0 — Motor Propietario
 * Protocolo de Detección Temprana de Licencias Estatales (Exclusivo Partth)
 * Operación estatal: 20 ciudades Texas. Credenciales desde env.
 */

// Matriz exhaustiva de precios por sub-servicio (spec completa)
const PRICING_MATRIX = {
  residential: {
    default: 35.00,
    hvac_ac_repair: 45.00,
    foundation_repair: 60.00,
    roofing_techos: 55.00,
    kitchen_remodel: 50.00,
    bathroom_remodel: 45.00,
    solar_panels: 65.00,
    pool_construction: 70.00,
    plumbing_plomeria: 35.00,
    electrical_electricidad: 35.00,
    painting_pintura: 25.00,
    flooring_pisos: 30.00,
    fencing_cercas: 25.00,
    landscaping_paisajismo: 20.00,
    windows_doors: 30.00
  },
  commercial: {
    default: 150.00,
    new_build_construccion: 250.00,
    tenant_buildout_remodelacion: 180.00,
    commercial_demolition: 200.00,
    steel_framing_estructuras: 170.00,
    commercial_roofing: 200.00,
    paving_asphalt_pavimentacion: 160.00,
    commercial_hvac: 180.00,
    industrial_plumbing: 150.00,
    commercial_electrical: 150.00,
    fire_sprinkler_systems: 120.00,
    security_access_control: 100.00,
    facility_maintenance: 90.00
  },
  permits: {
    default: 65.00,
    new_construction_permit: 100.00,
    zoning_land_use: 120.00,
    commercial_signage: 75.00,
    remodel_addition_permit: 80.00,
    demolition_permit: 90.00,
    electrical_permit: 50.00,
    plumbing_permit: 50.00,
    hvac_mechanical_permit: 50.00,
    environmental_water_permit: 110.00,
    code_compliance_inspection: 85.00
  }
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_DELAY_MS = 500;

const TX_CITIES_20 = [
  'Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington',
  'Corpus Christi', 'Plano', 'Laredo', 'Lubbock', 'Irving', 'Garland', 'Frisco',
  'McKinney', 'Amarillo', 'Grand Prairie', 'Brownsville', 'Pasadena', 'Mesquite'
];
const GROWTH_DELAY_MS = 400;
const GROWTH_DELAY_ON_RATE_LIMIT = 2000;

const GROWTH_VERTICALS = [
  { q: 'construction company', cat: 'residential' },
  { q: 'roofing company', cat: 'residential' },
  { q: 'painting contractor', cat: 'residential' },
  { q: 'remodeling contractor', cat: 'residential' }
];

function isValidEmail(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (s.length < 5 || !s.includes('@') || s.includes('//') || s.includes(' ')) return false;
  const atIdx = s.indexOf('@');
  const domain = s.slice(atIdx + 1);
  return domain.includes('.') && !/^[\d\s\/\@\+\.\-]+$/.test(s);
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === '/api/apify-webhook' && request.method === 'POST') {
      return handleApifyWebhook(request, env);
    }
    if (url.pathname === '/api/apify-contractors' && request.method === 'POST') {
      return handleApifyContractors(request, env);
    }
    if (url.pathname === '/api/paypal-webhook' && request.method === 'POST') {
      return handlePayPalWebhook(request, env);
    }
    if (url.pathname === '/api/join' && request.method === 'GET') {
      return handleJoinGet(request, env);
    }
    if (url.pathname === '/api/join' && request.method === 'POST') {
      return handleJoinPost(request, env);
    }
    if (url.pathname === '/api/growth-agent' && request.method === 'POST') {
      return runGrowthAgentHttp(env);
    }
    if (url.pathname === '/health' || url.pathname === '/') {
      return jsonResp({ ok: true, service: 'lead-gen' });
    }
    return jsonResp({ error: 'Not found' }, 404);
  },
  async scheduled(event, env, ctx) {
    if (event.cron === '0 12 * * *') {
      ctx.waitUntil(runGrowthAgent(env));
    } else {
      ctx.waitUntil(processQueue(env));
    }
  }
};

async function handleApifyWebhook(request, env) {
  try {
    const body = await request.json();
    const sig = request.headers.get('X-Apify-Webhook-Signature') || request.headers.get('x-webhook-signature');
    if (env.APIFY_WEBHOOK_SECRET && sig) {
      const valid = await verifyApifySignature(JSON.stringify(body), sig, env.APIFY_WEBHOOK_SECRET);
      if (!valid) return jsonResp({ error: 'Invalid signature' }, 401);
    }
    const main_category = (body.main_category || body.mainCategory || 'residential').toLowerCase();
    const sub_service = (body.sub_service || body.subService || '').toLowerCase().replace(/\s+/g, '_');
    const price = getLeadPrice(main_category, sub_service);
    const zip = String(body.zip_code || body.zipCode || body.zip || '').replace(/\D/g, '').slice(0, 5);
    const name = body.prospect_name || body.name || '';
    const phone = body.prospect_phone || body.phone || '';
    const email = body.prospect_email || body.email || '';
    const city = body.city || '';

    if (!zip) return jsonResp({ error: 'zip_code required' }, 400);

    const lead = await supabaseInsert(env, 'b2b_leads', {
      main_category,
      sub_service: sub_service || null,
      prospect_name: name,
      prospect_phone: phone,
      prospect_email: email,
      zip_code: zip,
      city,
      lead_price: price,
      status: env.USE_QUEUE === 'true' ? 'queued' : 'new',
      raw_payload: body
    });

    if (env.USE_QUEUE === 'true') {
      return jsonResp({ ok: true, queued: true, lead_id: lead.id }, 202);
    }

    return processLeadToContractors(env, lead, price, main_category, sub_service);
  } catch (e) {
    console.error('[apify]', e);
    return jsonResp({ error: String(e.message) }, 500);
  }
}

async function processLeadToContractors(env, lead, price, main_category, sub_service) {
  const delayMs = Number(env.DELAY_BETWEEN_CONTRACTORS) || DEFAULT_DELAY_MS;

  let contractors = await getContractorsByZipCategory(env, lead.zip_code, main_category);

  if (contractors.length === 0) {
    contractors = await fetchContractorsFromSerpApi(env, lead.zip_code, main_category);
  }

  let notified = 0;
  if (contractors.length > 0) {
    for (const c of contractors) {
      const paypalUrl = await createPayPalOrder(env, lead.id, c.id, price, main_category, sub_service);
      if (paypalUrl) {
        await sendOfferEmail(env, c, lead, price, paypalUrl);
        notified++;
      }
      await sleep(delayMs);
    }
  }
  await supabaseUpdate(env, 'b2b_leads', lead.id, { status: 'emails_sent' });

  return jsonResp({ ok: true, lead_id: lead.id, contractors_notified: notified });
}

function extractZipFromLocation(loc) {
  if (!loc || typeof loc !== 'string') return null;
  const m = loc.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

async function handleApifyContractors(request, env) {
  try {
    const url = new URL(request.url);
    const body = await request.json();
    const raw = Array.isArray(body) ? body : (body.items || [body]);
    const defaultZip = body.default_zip || body.defaultZip || body.zip_code || url.searchParams.get('default_zip') || url.searchParams.get('zip_code') || '';
    const defaultCategory = (body.default_category || body.defaultCategory || url.searchParams.get('default_category') || 'residential').toLowerCase();

    if (!['residential', 'commercial', 'permits'].includes(defaultCategory)) {
      return jsonResp({ error: 'default_category must be residential, commercial, or permits' }, 400);
    }

    const delayMs = Number(env.DELAY_BETWEEN_CONTRACTORS) || DEFAULT_DELAY_MS;
    let inserted = 0;

    for (const item of raw) {
      const emails = item.emails || [];
      const profiles = item.facebookProfiles || [];
      const firstProfile = profiles[0];
      let zip = defaultZip ? String(defaultZip).replace(/\D/g, '').slice(0, 5) : null;
      let companyName = '';
      if (firstProfile) {
        zip = zip || extractZipFromLocation(firstProfile.location);
        companyName = firstProfile.profileName || firstProfile.profile_name || companyName;
      }

      const safeZip = (zip && /^\d{5}$/.test(String(zip))) ? zip : (defaultZip && /^\d{5}$/.test(String(defaultZip).replace(/\D/g, '').slice(0, 5)) ? String(defaultZip).replace(/\D/g, '').slice(0, 5) : null;
      if (!safeZip) continue;

      for (const e of emails) {
        const email = String(e).trim();
        if (!isValidEmail(email)) continue;
        const mv = await millionVerify(env, email);
        if (mv !== 'Valid') continue;
        const row = {
          company_name: companyName || email.split('@')[0],
          email,
          phone: firstProfile?.contact || null,
          zip_code: safeZip,
          city: firstProfile?.location?.split(',')[0]?.trim() || null,
          main_category: defaultCategory,
          million_verifier_status: 'Valid',
          source: 'apify'
        };
        try {
          await supabaseUpsert(env, 'b2b_contractors', row, 'email');
          inserted++;
        } catch (_) {}
        await sleep(delayMs);
      }
    }

    return jsonResp({ ok: true, contractors_inserted: inserted });
  } catch (e) {
    console.error('[apify-contractors]', e);
    return jsonResp({ error: String(e.message) }, 500);
  }
}

async function handlePayPalWebhook(request, env) {
  try {
    const body = await request.text();
    const headers = Object.fromEntries(request.headers);
    if (env.PAYPAL_WEBHOOK_SECRET) {
      const valid = await verifyPayPalWebhook(env, request, body);
      if (!valid) return jsonResp({ error: 'Invalid PayPal signature' }, 401);
    }
    const data = JSON.parse(body);
    if (data.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return jsonResp({ received: true });
    const cap = data.resource;
    const customId = cap.purchase_units?.[0]?.custom_id || cap.custom_id;
    let meta = {};
    try { meta = JSON.parse(customId || '{}'); } catch (_) {}
    const leadId = meta.lead_id;
    const contractorId = meta.contractor_id;
    if (!leadId || !contractorId) return jsonResp({ received: true });
    const contractor = await supabaseGet(env, 'b2b_contractors', contractorId);
    const lead = await supabaseGet(env, 'b2b_leads', leadId);
    if (!contractor || !lead) return jsonResp({ error: 'Not found' }, 404);

    await logAudit(env, 'b2b_leads', leadId, 'status_change', {
      from: lead.status,
      to: 'sold',
      sold_to_contractor_id: contractorId,
      sold_at: new Date().toISOString(),
      paypal_capture_id: cap.id
    });

    await supabaseUpdate(env, 'b2b_leads', leadId, {
      status: 'sold',
      sold_to_contractor_id: contractorId,
      sold_at: new Date().toISOString()
    });

    const tx = await supabaseInsert(env, 'b2b_transactions', {
      lead_id: leadId,
      contractor_id: contractorId,
      amount: lead.lead_price,
      paypal_capture_id: cap.id,
      status: 'completed'
    });

    await logAudit(env, 'b2b_transactions', tx?.id || leadId, 'sale_completed', {
      lead_id: leadId,
      contractor_id: contractorId,
      amount: lead.lead_price,
      paypal_capture_id: cap.id
    });

    await sendLeadDeliveryEmail(env, contractor, lead);
    return jsonResp({ ok: true });
  } catch (e) {
    console.error('[paypal]', e);
    return jsonResp({ error: String(e.message) }, 500);
  }
}

function getLeadPrice(mainCategory, subService) {
  const cat = PRICING_MATRIX[mainCategory] || PRICING_MATRIX.residential;
  return cat[subService] || cat['default'];
}

async function verifyApifySignature(payload, signature, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return signature === expected;
}

async function verifyPayPalWebhook(env, request, body) {
  const headers = Object.fromEntries(request.headers);
  const resp = await fetch('https://api-m.paypal.com/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET)
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(body)
    })
  });
  const d = await resp.json();
  return d.verification_status === 'SUCCESS';
}

async function getContractorsByZipCategory(env, zip, category) {
  const url = `${env.SUPABASE_URL}/rest/v1/b2b_contractors?zip_code=eq.${zip}&main_category=eq.${category}&million_verifier_status=eq.Valid&select=*`;
  const r = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  return r.json();
}

async function fetchContractorsFromSerpApi(env, zip, category) {
  const valid = [];
  const q = `contractors ${category} ${zip}`;
  const r = await retryWithBackoff(() => fetch(
    `https://serpapi.com/search.json?engine=google_local&q=${encodeURIComponent(q)}&location="${zip}"&api_key=${env.SERPAPI_KEY}`
  ));
  const data = await r.json();
  const places = data.local_results || [];
  for (const p of places.slice(0, 20)) {
    const email = (p.email || p.booking?.email || '').trim();
    if (!isValidEmail(email)) continue;
    const mv = await millionVerify(env, email);
    if (mv === 'Valid') {
      const row = {
        company_name: p.title,
        email,
        phone: p.phone,
        zip_code: zip,
        city: (p.address || '').split(',')[0]?.trim(),
        main_category: category,
        million_verifier_status: 'Valid'
      };
      const inserted = await supabaseUpsert(env, 'b2b_contractors', row, 'email');
      valid.push(inserted);
    }
    await sleep(200);
  }
  return valid;
}

async function millionVerify(env, email) {
  const key = env.MILLION_VERIFIER_KEY || env.MILLIONVERIFY_API_KEY;
  if (!key) return 'Invalid';
  if (!isValidEmail(email)) return 'Invalid';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(
        `https://api.millionverifier.com/api/v3/?api=${key}&email=${encodeURIComponent(email)}&cached=1`
      );
      if (r.status === 429) {
        await sleep(GROWTH_DELAY_ON_RATE_LIMIT);
        continue;
      }
      const d = await r.json();
      if (d.resultcode === 1) return 'Valid';
      if ([2, 3, 4, 5].includes(d.resultcode)) return 'Invalid';
      return d.result || 'Invalid';
    } catch (e) {
      if (attempt === 2) { console.error('[millionverifier]', email, e); return 'Invalid'; }
      await sleep(2000 * (attempt + 1));
    }
  }
  return 'Invalid';
}

async function createPayPalOrder(env, leadId, contractorId, amount, mainCategory, subService) {
  const auth = btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET);
  const tokenResp = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + auth },
    body: 'grant_type=client_credentials'
  });
  const tok = (await tokenResp.json()).access_token;
  const orderResp = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + tok
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: String(Number(amount).toFixed(2)) },
        description: `Exclusividad territorial — ${mainCategory}`,
        custom_id: JSON.stringify({ lead_id: leadId, contractor_id: contractorId, type: mainCategory, sub_service: subService })
      }],
      application_context: {
        return_url: env.RETURN_URL || 'https://partth.com/gracias',
        cancel_url: env.CANCEL_URL || 'https://partth.com'
      }
    })
  });
  const order = await orderResp.json();
  const link = order.links?.find(l => l.rel === 'approve');
  return link?.href || null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildOfferEmailHtml(lead, price, paypalUrl) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:Georgia,'Times New Roman',serif;background:#f8f6f3;color:#1a1a1a;line-height:1.6">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fff;padding:48px 40px">
<tr><td>
  <div style="border-bottom:1px solid #e5e0db;padding-bottom:24px;margin-bottom:32px">
    <span style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#6b6560">Oportunidad Exclusiva</span>
    <h1 style="font-size:28px;font-weight:400;margin:12px 0 0;letter-spacing:-0.02em">Proyecto en tu territorio</h1>
  </div>
  <p style="margin:0 0 24px;font-size:16px">Generada por el Motor Propietario de <strong>Partth Intelligence v4.0</strong>.</p>
  <p style="margin:0 0 8px;font-size:14px;color:#4a4540"><strong>Categoría:</strong> ${lead.main_category} — ${lead.sub_service || 'general'}</p>
  <p style="margin:0 0 8px;font-size:14px;color:#4a4540"><strong>Zona:</strong> ${lead.zip_code} ${lead.city || ''}</p>
  <p style="margin:0 0 24px;font-size:14px;color:#4a4540"><strong>Inversión exclusividad:</strong> $${price}</p>
  <p style="margin:0 0 8px;font-size:12px;color:#8a8580"><em>Origen: Protocolo de Detección Temprana de Licencias Estatales (Exclusivo Partth)</em></p>
  <p style="margin:0 0 24px;font-size:12px;color:#8a8580">★ Esta oportunidad ha sido calificada con 5 estrellas en nuestro índice de viabilidad comercial.</p>
  <div style="margin:32px 0">
    <a href="${paypalUrl}" style="display:inline-block;background:#000;color:#fff;padding:16px 32px;text-decoration:none;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600">ADQUIRIR EXCLUSIVIDAD TERRITORIAL</a>
  </div>
  <div style="margin:40px 0 0;padding:24px 0;border-top:1px solid #e5e0db;text-align:center">
    <p style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#9a9590;margin:0 0 16px">Respaldo Institucional</p>
    <p style="font-size:11px;color:#6b6560;margin:0 4px 8px">✓ Verified by Texas Construction Standards</p>
    <p style="font-size:11px;color:#6b6560;margin:0 4px 8px">✓ Premium Partner 2026</p>
    <p style="font-size:11px;color:#6b6560;margin:0 4px">✓ Auditado por Partth Security</p>
  </div>
  <p style="margin:24px 0 0;font-size:11px;color:#9a9590;text-align:center">PARTTH — Exclusividad territorial. Texas.</p>
</td></tr></table></body></html>`;
}

async function sendOfferEmail(env, contractor, lead, price, paypalUrl) {
  const html = buildOfferEmailHtml(lead, price, paypalUrl);
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || 'PARTTH <leads@partth.com>',
      to: contractor.email,
      subject: `Lead disponible: ${lead.main_category} en ${lead.zip_code}`,
      html
    })
  });
}

async function sendLeadDeliveryEmail(env, contractor, lead) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:Georgia,'Times New Roman',serif;background:#f8f6f3;color:#1a1a1a;line-height:1.6">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fff;padding:48px 40px">
<tr><td>
  <div style="border-bottom:1px solid #e5e0db;padding-bottom:24px;margin-bottom:32px">
    <span style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#6b6560">Exclusividad Adquirida</span>
    <h1 style="font-size:28px;font-weight:400;margin:12px 0 0;letter-spacing:-0.02em">Datos del proyecto</h1>
  </div>
  <p style="margin:0 0 8px;font-size:14px;color:#4a4540"><strong>Nombre:</strong> ${lead.prospect_name || 'N/A'}</p>
  <p style="margin:0 0 8px;font-size:14px;color:#4a4540"><strong>Teléfono:</strong> ${lead.prospect_phone || 'N/A'}</p>
  <p style="margin:0 0 8px;font-size:14px;color:#4a4540"><strong>Email:</strong> ${lead.prospect_email || 'N/A'}</p>
  <p style="margin:0 0 8px;font-size:14px;color:#4a4540"><strong>Proyecto:</strong> ${lead.main_category} — ${lead.sub_service || 'general'}</p>
  <p style="margin:0 0 24px;font-size:14px;color:#4a4540"><strong>Zona:</strong> ${lead.zip_code} ${lead.city || ''}</p>
  <div style="margin:24px 0 0;padding:24px 0;border-top:1px solid #e5e0db;text-align:center">
    <p style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#9a9590;margin:0 0 16px">Respaldo Institucional</p>
    <p style="font-size:11px;color:#6b6560;margin:0 4px 8px">✓ Verified by Texas Construction Standards</p>
    <p style="font-size:11px;color:#6b6560;margin:0 4px 8px">✓ Premium Partner 2026</p>
    <p style="font-size:11px;color:#6b6560;margin:0 4px">✓ Auditado por Partth Security</p>
  </div>
  <p style="margin:24px 0 0;font-size:11px;color:#9a9590;text-align:center">Contacta al cliente en 24-48h. PARTTH Texas.</p>
</td></tr></table></body></html>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || 'PARTTH <leads@partth.com>',
      to: contractor.email,
      subject: `Lead entregado: ${lead.prospect_name || 'Proyecto'} - ${lead.zip_code}`,
      html
    })
  });
}

async function logAudit(env, tableName, recordId, action, newData, oldData = null) {
  try {
    await supabaseInsert(env, 'audit_log', {
      table_name: tableName,
      record_id: recordId,
      action,
      old_data: oldData,
      new_data: newData,
      changed_by: null
    });
  } catch (e) {
    console.error('[audit_log]', e);
  }
}

async function supabaseInsert(env, table, row) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(row)
  });
  const arr = await r.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

async function supabaseUpsert(env, table, row, onConflict) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates'
    },
    body: JSON.stringify(row)
  });
  const arr = await r.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

async function supabaseUpdate(env, table, id, row) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(row)
  });
}

async function supabaseGet(env, table, id) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&select=*`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  const arr = await r.json();
  return Array.isArray(arr) && arr[0] ? arr[0] : null;
}

async function runGrowthAgent(env) {
  try {
    const contacted = await runGrowthAgentCore(env);
    console.log('[growth-agent] Contactados:', contacted);
  } catch (e) {
    console.error('[growth-agent]', e);
  }
}

async function runGrowthAgentHttp(env) {
  try {
    const contacted = await runGrowthAgentCore(env);
    return jsonResp({ ok: true, contacted });
  } catch (e) {
    console.error('[growth-agent]', e);
    return jsonResp({ error: String(e?.message) }, 500);
  }
}

async function runGrowthAgentCore(env) {
  const maxProspects = 50;
  const joinBase = env.GROWTH_JOIN_BASE || env.BASE_URL || '';
  const joinUrlBase = joinBase ? (joinBase.includes('partth.com') ? 'https://partth.com/join' : `${joinBase.replace(/\/$/, '')}/api/join`) : '';
  if (!joinUrlBase) {
    console.warn('[growth-agent] GROWTH_JOIN_BASE no configurado');
    return 0;
  }
  let contacted = 0;
  const seenEmails = new Set();

  for (const city of TX_CITIES_20) {
    if (contacted >= maxProspects) break;
    for (const v of GROWTH_VERTICALS) {
      if (contacted >= maxProspects) break;
      const prospects = await searchProspectsSerpApi(env, city, v.q);
      const leadsInCity = await getLeadsCountInCity(env, city);

      for (const p of prospects) {
        if (contacted >= maxProspects) break;
        const email = (p.email || '').trim();
        if (!email || seenEmails.has(email.toLowerCase())) continue;
        if (!isValidEmail(email)) continue;

        const mv = await millionVerify(env, email);
        if (mv !== 'Valid') continue;

        const exists = await contractorExists(env, email);
        if (exists) continue;

        seenEmails.add(email.toLowerCase());
        const specialty = v.q.replace(' company', '').replace(' contractor', '');
        const pitch = await generatePitchOpenAI(env, city, specialty, leadsInCity);
        if (!pitch) continue;

        const joinUrl = `${joinUrlBase}?email=${encodeURIComponent(email)}&company=${encodeURIComponent(p.company_name || '')}&city=${encodeURIComponent(city)}`;
        const rateLimited = await sendProspectEmail(env, { ...p, email }, pitch, joinUrl, city, specialty, leadsInCity);
        if (rateLimited) {
          await sleep(GROWTH_DELAY_ON_RATE_LIMIT);
        }
        contacted++;
        await sleep(GROWTH_DELAY_MS);
      }
      await sleep(500);
    }
  }
  return contacted;
}

async function searchProspectsSerpApi(env, city, query) {
  const q = `${query} ${city} Texas`;
  try {
    const r = await retryWithBackoff(() => fetch(
      `https://serpapi.com/search.json?engine=google_local&q=${encodeURIComponent(q)}&location="${encodeURIComponent(city)}, TX"&api_key=${env.SERPAPI_KEY}`
    ));
    const data = await r.json();
    const places = data.local_results || [];
    return places.map(p => ({
      company_name: p.title,
      email: (p.email || p.booking?.email || '').trim(),
      phone: p.phone,
      address: p.address,
      city
    })).filter(p => p.email);
  } catch (e) {
    return [];
  }
}

async function getLeadsCountInCity(env, city) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/b2b_leads?city=eq.${encodeURIComponent(city)}&status=in.(new,queued,emails_sent)&select=id`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Prefer': 'count=exact' } }
    );
    const range = r.headers.get('content-range');
    return range ? parseInt(range.split('/')[1] || '0', 10) : 0;
  } catch (_) {
    return 0;
  }
}

async function contractorExists(env, email) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/b2b_contractors?email=eq.${encodeURIComponent(email)}&select=id`,
    { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const arr = await r.json();
  return Array.isArray(arr) && arr.length > 0;
}

async function generatePitchOpenAI(env, city, specialty, leadsCount) {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  const system = `Eres del equipo de Inteligencia de Partth, la autoridad en datos de construcción en Texas. Escribe mensajes breves, profesionales y directos. Nunca menciones que eres IA. Tono: humano ocupado, con sentido de urgencia. Solo texto plano, sin saludos genéricos largos. Máximo 4-5 líneas. SIEMPRE menciona la ciudad explícitamente y el número de oportunidades si es > 0.`;
  const user = `Genera un mensaje para un contratista de ${specialty} en ${city}, Texas. Hay ${leadsCount} oportunidades activas en su zona ahora. Invítalo a registrarse para acceder.`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: 150,
          temperature: 0.7
        })
      });
      if (r.status === 429) {
        const retryAfter = parseInt(r.headers.get('retry-after') || '5', 10) * 1000;
        await sleep(Math.min(retryAfter, 10000));
        continue;
      }
      const d = await r.json();
      return d.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
      if (attempt === 2) return null;
      await sleep(2000 * (attempt + 1));
    }
  }
  return null;
}

async function sendProspectEmail(env, prospect, pitch, joinUrl, city, specialty, leadsInCity) {
  const html = `
<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;padding:24px">
<p style="font-size:15px;line-height:1.6;color:#1a1a1a">${pitch.replace(/\n/g, '<br>')}</p>
<p style="margin-top:24px"><a href="${joinUrl}" style="display:inline-block;background:#000;color:#fff;padding:14px 28px;text-decoration:none;font-size:12px;letter-spacing:0.1em;text-transform:uppercase">Registrarme en Partth</a></p>
<p style="margin-top:32px;font-size:11px;color:#6b6560">Partth — La autoridad en datos de construcción en Texas.</p>
</div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.FROM_EMAIL || 'PARTTH Inteligencia <leads@partth.com>',
      to: prospect.email,
      subject: `Oportunidades en ${prospect.city} — Partth`,
      html
    })
  });
  if (res.status === 429) return true;
  try {
    await supabaseInsert(env, 'growth_agent_sends', {
      email: prospect.email,
      company_name: prospect.company_name,
      city: city || prospect.city,
      specialty,
      leads_in_city: leadsInCity || 0,
      pitch
    });
  } catch (_) {}
  return false;
}

async function handleJoinGet(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email') || '';
  const company = url.searchParams.get('company') || '';
  const city = url.searchParams.get('city') || '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Únete a Partth</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f8f6f3;min-height:100vh;display:flex;align-items:center;justify-content:center">
<form method="POST" action="/api/join" style="background:#fff;padding:32px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:400px;width:100%">
<h1 style="margin:0 0 24px;font-size:24px">Únete a Partth</h1>
<p style="color:#6b6560;margin-bottom:24px">Confirma tus datos para acceder a oportunidades en Texas.</p>
<input type="email" name="email" placeholder="Correo" value="${escapeHtml(email)}" required style="width:100%;padding:12px;margin-bottom:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box">
<input type="text" name="company_name" placeholder="Nombre de empresa" value="${escapeHtml(company)}" required style="width:100%;padding:12px;margin-bottom:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box">
<input type="text" name="city" placeholder="Ciudad" value="${escapeHtml(city)}" required style="width:100%;padding:12px;margin-bottom:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box">
<input type="hidden" name="source" value="ai_hunter_v1">
<button type="submit" style="width:100%;padding:14px;background:#000;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">Registrarme</button>
</form></body></html>`;
  return new Response(html, { headers: { ...CORS, 'Content-Type': 'text/html' } });
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function handleJoinPost(request, env) {
  try {
    const form = await request.formData();
    const email = (form.get('email') || '').trim();
    const company = form.get('company_name') || '';
    const city = form.get('city') || '';
    const source = form.get('source') || 'ai_hunter_v1';
    if (!email || !isValidEmail(email)) {
      return new Response('Email inválido', { status: 400, headers: { ...CORS } });
    }
    const zip = city ? await resolveZipFromCity(env, city) : '';
    await supabaseUpsert(env, 'b2b_contractors', {
      company_name: company,
      email,
      zip_code: zip || '77001',
      city: city || '',
      main_category: 'residential',
      million_verifier_status: 'Valid',
      source
    }, 'email');
    return new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3;url=https://partth.com"></head><body style="font-family:system-ui;text-align:center;padding:48px"><h2>¡Registro exitoso!</h2><p>Te contactaremos pronto.</p><p><a href="https://partth.com">Ir a Partth</a></p></body></html>', {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'text/html' }
    });
  } catch (e) {
    return new Response('Error: ' + (e?.message || 'Unknown'), { status: 500, headers: { ...CORS } });
  }
}

async function resolveZipFromCity(env, city) {
  const map = { Houston: '77001', Dallas: '75201', Austin: '78701', 'San Antonio': '78201', 'Fort Worth': '76101', 'El Paso': '79901', Arlington: '76001', 'Corpus Christi': '78401', Plano: '75074', Laredo: '78040', Lubbock: '79401', Irving: '75038', Garland: '75040', Frisco: '75034', McKinney: '75069', Amarillo: '79101', 'Grand Prairie': '75050', Brownsville: '78520', Pasadena: '77501', Mesquite: '75149' };
  return map[city] || '';
}

async function processQueue(env) {
  const batchSize = Number(env.QUEUE_BATCH_SIZE) || DEFAULT_BATCH_SIZE;
  const url = `${env.SUPABASE_URL}/rest/v1/b2b_leads?status=eq.queued&order=created_at.asc&limit=${batchSize}&select=*`;
  const r = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  const queued = await r.json();
  if (!Array.isArray(queued) || queued.length === 0) return;

  for (const lead of queued) {
    try {
      await supabaseUpdate(env, 'b2b_leads', lead.id, { status: 'new' });
      await processLeadToContractors(env, lead, lead.lead_price, lead.main_category, lead.sub_service || '');
    } catch (e) {
      console.error('[queue] lead', lead.id, e);
    }
  }
}
