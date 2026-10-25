
/**
 * Public read-only API for the Gembug Update page.
 * Required Cloudflare Pages secrets:
 * GOOGLE_SHEETS_URL
 * OVERLAY_API_KEY
 * WORKOUT_MANAGER_API_KEY
 *
 * Jangan pernah mencatat atau mengirim API key ke log.
 */

export async function onRequestGet({ env }) {
  const {
    GOOGLE_SHEETS_URL,
    OVERLAY_API_KEY,
    WORKOUT_MANAGER_API_KEY
  } = env;

  if (
    !GOOGLE_SHEETS_URL ||
    !OVERLAY_API_KEY ||
    !WORKOUT_MANAGER_API_KEY
  ) {
    console.error("Gembug API: required environment variable is missing.");

    return json({
      success: false,
      error: "API Gembug belum dikonfigurasi."
    }, 500);
  }

  let stage = "initialization";

  try {
    stage = "build-upstream-urls";

    const overlayUrl = new URL(GOOGLE_SHEETS_URL);
    overlayUrl.searchParams.set("action", "overlay");
    overlayUrl.searchParams.set("key", OVERLAY_API_KEY);

    const configUrl = new URL(GOOGLE_SHEETS_URL);
    configUrl.searchParams.set("action", "manager-config");
    configUrl.searchParams.set("key", WORKOUT_MANAGER_API_KEY);

    stage = "fetch-google-apps-script";

    const [overlayResponse, configResponse] = await Promise.all([
      fetch(overlayUrl.toString(), { redirect: "follow" }),
      fetch(configUrl.toString(), { redirect: "follow" })
    ]);

    console.log("Gembug upstream HTTP status:", {
      overlayStatus: overlayResponse.status,
      configStatus: configResponse.status
    });

    stage = "read-upstream-responses";

    const [overlayText, configText] = await Promise.all([
      overlayResponse.text(),
      configResponse.text()
    ]);

    stage = "parse-overlay-json";

    let overlay;

    try {
      overlay = JSON.parse(overlayText);
    } catch (error) {
      console.error("Gembug overlay response is not valid JSON.", {
        status: overlayResponse.status,
        contentType: overlayResponse.headers.get("content-type"),
        errorName: error?.name
      });

      throw new Error("Overlay response is not valid JSON.");
    }

    stage = "parse-manager-config-json";

    let config;

    try {
      config = JSON.parse(configText);
    } catch (error) {
      console.error("Gembug manager-config response is not valid JSON.", {
        status: configResponse.status,
        contentType: configResponse.headers.get("content-type"),
        errorName: error?.name
      });

      throw new Error("Manager-config response is not valid JSON.");
    }

    stage = "validate-upstream-data";

    if (!overlayResponse.ok || !configResponse.ok) {
      console.error("Gembug upstream returned an HTTP error.", {
        overlayStatus: overlayResponse.status,
        configStatus: configResponse.status
      });

      return json({
        success: false,
        error: "Google Sheets belum bisa dihubungi."
      }, 502);
    }

    if (
      overlay.success !== true ||
      config.success !== true
    ) {
      console.error("Gembug upstream returned an unsuccessful response.", {
        overlaySuccess: overlay.success,
        overlayError: overlay.error || null,
        configSuccess: config.success,
        configError: config.error || null
      });

      return json({
        success: false,
        error: "Google Apps Script menolak atau gagal memproses permintaan."
      }, 502);
    }

    if (
      !Array.isArray(overlay.workouts) ||
      !Array.isArray(overlay.queue) ||
      !Array.isArray(config.workouts)
    ) {
      console.error("Gembug upstream data has an unexpected structure.", {
        overlayWorkoutsArray: Array.isArray(overlay.workouts),
        overlayQueueArray: Array.isArray(overlay.queue),
        configWorkoutsArray: Array.isArray(config.workouts)
      });

      return json({
        success: false,
        error: "Format data Gembug tidak sesuai."
      }, 502);
    }

    stage = "format-public-data";

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
    }, 200);

  } catch (error) {
    console.error("Gembug Update API failure:", {
      stage,
      errorName: error?.name || "Error",
      message: String(error?.message || error).slice(0, 200)
    });

    return json({
      success: false,
      error: "Gagal mengambil data Gembug."
    }, 502);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
