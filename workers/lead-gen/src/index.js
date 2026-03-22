/**
 * B2B Lead Gen Worker — Apify → SerpApi → MillionVerifier → Match → Resend → PayPal
 * Operación estatal de alto volumen: cola, índices, control de concurrencia.
 * Todas las credenciales desde env (wrangler secret put)
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
    if (url.pathname === '/health' || url.pathname === '/') {
      return jsonResp({ ok: true, service: 'lead-gen' });
    }
    return jsonResp({ error: 'Not found' }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processQueue(env));
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
    await supabaseUpdate(env, 'b2b_leads', leadId, {
      status: 'sold',
      sold_to_contractor_id: contractorId,
      sold_at: new Date().toISOString()
    });
    await supabaseInsert(env, 'b2b_transactions', {
      lead_id: leadId,
      contractor_id: contractorId,
      amount: lead.lead_price,
      paypal_capture_id: cap.id,
      status: 'completed'
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
  return cat[subService] ?? cat.default;
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
  try {
    const r = await retryWithBackoff(() => fetch(
      `https://api.millionverifier.com/api/v3/?api=${key}&email=${encodeURIComponent(email)}&cached=1`
    ));
    const d = await r.json();
    if (d.resultcode === 1) return 'Valid';
    if ([2, 3, 4, 5].includes(d.resultcode)) return 'Invalid';
    return d.result || 'Invalid';
  } catch (e) {
    console.error('[millionverifier]', email, e);
    return 'Invalid';
  }
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
        description: `Lead ${mainCategory} - ${subService || 'general'}`,
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

async function sendOfferEmail(env, contractor, lead, price, paypalUrl) {
  const html = `
<h2>Nuevo proyecto en tu zona</h2>
<p><strong>Categoría:</strong> ${lead.main_category} - ${lead.sub_service || 'general'}</p>
<p><strong>Zona:</strong> ${lead.zip_code} ${lead.city || ''}</p>
<p><strong>Precio del lead:</strong> $${price}</p>
<p><a href="${paypalUrl}" style="background:#0070ba;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Pagar y recibir datos del lead</a></p>
<p style="color:#666;font-size:12px">PARTTH — Un lead por contratista. Texas.</p>`;
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
  const html = `
<h2>Datos del lead — Pago confirmado</h2>
<p><strong>Nombre:</strong> ${lead.prospect_name || 'N/A'}</p>
<p><strong>Teléfono:</strong> ${lead.prospect_phone || 'N/A'}</p>
<p><strong>Email:</strong> ${lead.prospect_email || 'N/A'}</p>
<p><strong>Proyecto:</strong> ${lead.main_category} - ${lead.sub_service || 'general'}</p>
<p><strong>Zona:</strong> ${lead.zip_code} ${lead.city || ''}</p>
<p style="color:#666;font-size:12px">Contacta al cliente en 24-48h. PARTTH Texas.</p>`;
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
