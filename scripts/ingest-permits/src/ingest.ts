/**
 * CRON Job: Ingest Dallas + Austin permits → raw_signals
 * Ejecutar: npm run ingest
 * CRON: 0 9 * * * (diario 9am) o cada 6h según necesidad
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://ptfsjqsckjqamaiagidj.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN && !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : (null as ReturnType<typeof createClient> | null);

// Dallas: Building Permits (Socrata)
const DALLAS_URL = "https://www.dallasopendata.com/resource/e7gq-4sah.json";
// Austin: Issued Construction Permits
const AUSTIN_URL = "https://data.austintexas.gov/resource/3syk-w9eu.json";

interface DallasPermit {
  permit_number: string;
  permit_type?: string;
  work_description?: string;
  street_address?: string;
  zip_code?: string;
  value?: string;
  issued_date?: string;
}

interface AustinPermit {
  permit_number: string;
  permit_type_desc?: string;
  work_class?: string;
  description?: string;
  permit_location?: string;
  original_address1?: string;
  original_city?: string;
  original_state?: string;
  original_zip?: string;
  issue_date?: string;
}

function buildAddress(addr?: string, city?: string, state?: string, zip?: string): string {
  const parts = [addr, city, state, zip].filter(Boolean);
  return parts.join(", ") || "";
}

async function fetchDallas(limit = 100): Promise<DallasPermit[]> {
  const url = `${DALLAS_URL}?$limit=${limit}&$order=issued_date DESC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dallas API: ${res.status}`);
  return res.json();
}

async function fetchAustin(limit = 100): Promise<AustinPermit[]> {
  const url = `${AUSTIN_URL}?$limit=${limit}&$order=issue_date DESC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Austin API: ${res.status}`);
  return res.json();
}

function toRawSignal(
  permitNumber: string,
  jobType: string,
  rawAddress: string,
  estimatedValue: number | null,
  source: "dallas" | "austin"
) {
  return {
    permit_number: permitNumber,
    job_type: jobType,
    raw_address: rawAddress || "Unknown",
    estimated_value: estimatedValue,
    ai_confidence_score: 50,
    processed: false,
  };
}

async function main() {
  console.log("[ingest] Iniciando...", DRY_RUN ? "(DRY RUN)" : "");

  const rows: Array<{
    permit_number: string;
    job_type: string;
    raw_address: string;
    estimated_value: number | null;
    ai_confidence_score: number;
    processed: boolean;
  }> = [];

  // Dallas
  try {
    const dallas = await fetchDallas(150);
    for (const p of dallas) {
      const permitNumber = String(p.permit_number ?? "").trim();
      if (!permitNumber) continue;

      const jobType = p.permit_type ?? p.work_description ?? "Unknown";
      const rawAddress = buildAddress(
        p.street_address,
        "Dallas",
        "TX",
        p.zip_code && p.zip_code !== "NULL" ? p.zip_code : undefined
      );
      const value = p.value && p.value !== "NULL" ? parseFloat(p.value) : null;

      rows.push(
        toRawSignal(permitNumber, jobType, rawAddress, value, "dallas")
      );
    }
    console.log(`[ingest] Dallas: ${dallas.length} permisos`);
  } catch (e) {
    console.error("[ingest] Dallas error:", e);
  }

  // Austin
  try {
    const austin = await fetchAustin(150);
    for (const p of austin) {
      const permitNumber = String(p.permit_number ?? "").trim();
      if (!permitNumber) continue;

      const jobType = p.work_class ?? p.permit_type_desc ?? p.description ?? "Unknown";
      const rawAddress = buildAddress(
        p.permit_location ?? p.original_address1,
        p.original_city ?? "Austin",
        p.original_state ?? "TX",
        p.original_zip
      );

      rows.push(
        toRawSignal(permitNumber, jobType, rawAddress, null, "austin")
      );
    }
    console.log(`[ingest] Austin: ${austin.length} permisos`);
  } catch (e) {
    console.error("[ingest] Austin error:", e);
  }

  if (rows.length === 0) {
    console.log("[ingest] No hay datos para insertar");
    return;
  }

  if (DRY_RUN) {
    console.log("[ingest] DRY RUN - muestreo:", rows.slice(0, 3));
    return;
  }

  if (!supabase) {
    console.error("[ingest] Supabase client no inicializado");
    process.exit(1);
  }

  // Upsert: permit_number es unique, ignorar duplicados
  const { data, error } = await supabase
    .from("raw_signals")
    .upsert(rows, {
      onConflict: "permit_number",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    console.error("[ingest] Supabase error:", error);
    process.exit(1);
  }

  console.log(`[ingest] Insertados/actualizados: ${data?.length ?? 0}`);
}

main();
