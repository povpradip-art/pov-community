/**
 * Public read-only API for the Gembug Update page.
 * Required Cloudflare Pages secrets:
 *   GOOGLE_SHEETS_URL
 *   OVERLAY_API_KEY
 *   WORKOUT_MANAGER_API_KEY
 * Never expose these secrets in browser HTML or commit them to GitHub.
 */
export async function onRequestGet({ env }) {
  const { GOOGLE_SHEETS_URL, OVERLAY_API_KEY, WORKOUT_MANAGER_API_KEY } = env;

  if (!GOOGLE_SHEETS_URL || !OVERLAY_API_KEY || !WORKOUT_MANAGER_API_KEY) {
    return json({ success: false, error: "API Gembug belum dikonfigurasi." }, 500);
  }

  try {
    const overlayUrl = new URL(GOOGLE_SHEETS_URL);
    overlayUrl.searchParams.set("action", "overlay");
    overlayUrl.searchParams.set("key", OVERLAY_API_KEY);

    const configUrl = new URL(GOOGLE_SHEETS_URL);
    configUrl.searchParams.set("action", "manager-config");
    configUrl.searchParams.set("key", WORKOUT_MANAGER_API_KEY);

    const [overlayResponse, configResponse] = await Promise.all([
      fetch(overlayUrl.toString(), { redirect: "follow" }),
      fetch(configUrl.toString(), { redirect: "follow" })
    ]);

    if (!overlayResponse.ok || !configResponse.ok) {
      return json({ success: false, error: "Google Sheets belum bisa dihubungi." }, 502);
    }

    const [overlay, config] = await Promise.all([
      overlayResponse.json(),
      configResponse.json()
    ]);

    if (overlay.success !== true || config.success !== true ||
        !Array.isArray(overlay.workouts) || !Array.isArray(overlay.queue) ||
        !Array.isArray(config.workouts)) {
      return json({ success: false, error: "Format data Gembug tidak sesuai." }, 502);
    }

    // Expose only public display fields. No API keys or management actions are returned.
    const workouts = config.workouts
      .filter(w => !w.isFinalBoss)
      .map(w => ({
        id: String(w.id ?? ""),
        name: String(w.name ?? "Workout"),
        quantity: Number(w.quantity ?? 0),
        unit: String(w.unit ?? "rep"),
        price: Number(w.price ?? 0),
        active: w.active === true
      }));

    const bank = overlay.workouts.map(w => ({
      id: String(w.id ?? ""),
      name: String(w.name ?? "Workout"),
      unit: String(w.unit ?? "rep"),
      active: w.active === true,
      masuk: Number(w.masuk ?? 0),
      dibayar: Number(w.dibayar ?? 0),
      sisa: Number(w.sisa ?? 0),
      penalty: Number(w.penalty ?? 0)
    }));

    const queue = overlay.queue.map((q, i) => ({
      position: Number(q.position ?? i + 1),
      id: String(q.id ?? ""),
      donor: String(q.donor ?? "Anonim"),
      status: String(q.status ?? "Menunggu")
    }));

    return json({
      success: true,
      workouts,
      bank,
      queue,
      updatedAt: overlay.updatedAt ?? new Date().toISOString()
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  } catch (error) {
    return json({ success: false, error: "Gagal mengambil data Gembug." }, 502);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      ...extraHeaders
    }
  });
}
