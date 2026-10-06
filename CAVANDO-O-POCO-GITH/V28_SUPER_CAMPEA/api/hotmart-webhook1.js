// Hotmart -> OpenAI Ads Conversions API
// Vercel Function (Node.js)
//
// Environment variable required:
// OPENAI_CONVERSION_API_KEY

const PIXEL_ID = "5ARgSkVtLyS5QfT66DHZGq";
const OPENAI_EVENTS_URL =
  `https://bzr.openai.com/v1/events?pid=${encodeURIComponent(PIXEL_ID)}`;

function getEventName(body) {
  return String(
    body?.event ||
    body?.event_name ||
    body?.eventName ||
    body?.type ||
    ""
  ).toUpperCase();
}

function isApprovedPurchase(body) {
  const eventName = getEventName(body);

  if (eventName === "PURCHASE_APPROVED") return true;

  const status = String(
    body?.data?.purchase?.status ||
    body?.purchase?.status ||
    ""
  ).toUpperCase();

  return status === "APPROVED";
}

function getTransactionId(body) {
  return String(
    body?.data?.purchase?.transaction ||
    body?.purchase?.transaction ||
    body?.data?.transaction ||
    body?.transaction ||
    body?.id ||
    ""
  ).trim();
}

function getTimestampMs(body) {
  const candidates = [
    body?.data?.purchase?.approved_date,
    body?.data?.purchase?.approvedDate,
    body?.purchase?.approved_date,
    body?.purchase?.approvedDate,
    body?.creation_date,
    body?.creationDate,
    body?.data?.purchase?.order_date,
    body?.data?.purchase?.orderDate
  ];

  for (const value of candidates) {
    if (value === undefined || value === null || value === "") continue;

    if (typeof value === "number") {
      return value < 1e12 ? value * 1000 : value;
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Date.now();
}

function getSourceUrl(body) {
  const url =
    body?.data?.purchase?.checkout_url ||
    body?.data?.purchase?.checkoutUrl ||
    body?.purchase?.checkout_url ||
    body?.purchase?.checkoutUrl;

  if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;

  return "https://livro.iabfapegma.com.br/";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
  }

  const apiKey = process.env.OPENAI_CONVERSION_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_CONVERSION_API_KEY is not configured.");
    return res.status(500).json({
      ok: false,
      error: "server_not_configured"
    });
  }

  const body = req.body || {};

  if (!isApprovedPurchase(body)) {
    return res.status(200).json({
      ok: true,
      ignored: true
    });
  }

  const transactionId = getTransactionId(body);

  if (!transactionId) {
    console.error("Approved Hotmart purchase received without transaction ID.");
    return res.status(400).json({
      ok: false,
      error: "missing_transaction_id"
    });
  }

  const eventId = `hotmart_${transactionId}`;

  const payload = {
    validate_only: false,
    events: [
      {
        id: eventId,
        type: "order_created",
        timestamp_ms: getTimestampMs(body),
        source_url: getSourceUrl(body),
        action_source: "web",
        data: {
          type: "contents"
        }
      }
    ]
  };

  try {
    const response = await fetch(OPENAI_EVENTS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "OpenAI Conversions API error:",
        response.status,
        responseText
      );

      // TEMPORARY DIAGNOSTIC:
      // Exposes OpenAI's validation response to the Hotmart test history.
      // It never exposes OPENAI_CONVERSION_API_KEY.
      return res.status(502).json({
        ok: false,
        error: "openai_conversion_api_error",
        status: response.status,
        openai_response: responseText
      });
    }

    return res.status(200).json({
      ok: true,
      forwarded: true,
      event_id: eventId
    });
  } catch (error) {
    console.error("Failed to call OpenAI Conversions API:", error);

    return res.status(500).json({
      ok: false,
      error: "forwarding_failed",
      message: String(error?.message || error)
    });
  }
};
