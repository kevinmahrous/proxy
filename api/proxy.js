export const config = {
  api: {
    bodyParser: false,
  },
};

const HF_MODEL_URL = "https://api-inference.huggingface.co/models/j-hartmann/emotion-english-distilroberta-base";
const FREESOUND_SEARCH_URL = "https://freesound.org/apiv2/search/text/";
const HF_TOKEN = process.env.HF_TOKEN;
const FS_TOKEN = process.env.FS_TOKEN;

const rateLimitWindowMs = 60 * 1000;
const maxRequestsPerWindow = 30;
const ipRequestLog = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const record = ipRequestLog.get(ip);
  if (!record || now - record.firstRequestTimestamp > rateLimitWindowMs) {
    ipRequestLog.set(ip, { count: 1, firstRequestTimestamp: now });
    return true;
  }
  if (record.count >= maxRequestsPerWindow) {
    return false;
  }
  record.count++;
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests, please slow down." });
  }

  const { api } = req.query;
  if (!api) return res.status(400).json({ error: "Missing 'api' query parameter." });

  try {
    if (api === "huggingface") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed, use POST." });
      }

      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const body = Buffer.concat(buffers);

      const proxyRes = await fetch(HF_MODEL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body,
      });

      const contentType = proxyRes.headers.get("content-type");
      res.setHeader("Content-Type", contentType || "application/json");

      const buffer = await proxyRes.arrayBuffer();
      return res.status(proxyRes.status).send(Buffer.from(buffer));
    }

    if (api === "freesound") {
      if (req.method !== "GET") {
        return res.status(405).json({ error: "Method Not Allowed, use GET." });
      }

      const query = req.query.q;
      if (!query) {
        return res.status(400).json({ error: "Missing 'q' query parameter for Freesound." });
      }

      const url = `${FREESOUND_SEARCH_URL}?query=${encodeURIComponent(query)}&fields=previews&token=${FS_TOKEN}`;
      const proxyRes = await fetch(url);

      const contentType = proxyRes.headers.get("content-type");
      res.setHeader("Content-Type", contentType || "application/json");

      const buffer = await proxyRes.arrayBuffer();
      return res.status(proxyRes.status).send(Buffer.from(buffer));
    }

    return res.status(400).json({ error: "Unknown 'api' value. Use 'huggingface' or 'freesound'." });
  } catch (err) {
    return res.status(500).json({ error: "Proxy failed", details: err.toString() });
  }
}