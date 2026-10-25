/** Public read-only endpoint. Reads the saved KV snapshot only; never calls Apps Script. */
export async function onRequestGet({ env }) {
  if (!env.GEMBUG_SNAPSHOT) {
    return json({ success: false, error: "Penyimpanan snapshot belum dikonfigurasi." }, 500);
  }
  try {
    const snapshot = await env.GEMBUG_SNAPSHOT.get("current", "json");
    if (!snapshot || snapshot.success !== true) {
      return json({ success: false, error: "Snapshot belum tersedia. Admin perlu menekan Load Data Terbaru." }, 503);
    }
    return json(snapshot, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
  } catch {
    return json({ success: false, error: "Gagal membaca snapshot Gembug." }, 500);
  }
}
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders } });
}
