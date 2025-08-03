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

if (req.method === "OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.status(204).end();
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (!ipRequestLog.has(ip)) {
    ipRequestLog.set(ip, { count: 1, firstRequestTimestamp: now });
    return true;
  }
  const data = ipRequestLog.get(ip);
  if (now - data.firstRequestTimestamp > rateLimitWindowMs) {
    ipRequestLog.set(ip, { count: 1, firstRequestTimestamp: now });
    return true;
  }
  if (data.count >= maxRequestsPerWindow) {
    return false;
  }
  data.count++;
  return true;
}

export default async function handler(req, res) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

  if (!checkRateLimit(ip)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(429).json({ error: "Too many requests, please slow down." });
  }

  const api = req.query.api;
  if (!api) {
    return res.status(400).json({ error: "Missing 'api' query parameter." });
  }

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
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", contentType || "application/json");

      const buffer = await proxyRes.arrayBuffer();
      return res.status(proxyRes.status).send(Buffer.from(buffer));

    } else if (api === "freesound") {
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
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", contentType || "application/json");

      const buffer = await proxyRes.arrayBuffer();
      return res.status(proxyRes.status).send(Buffer.from(buffer));

    } else {
      return res.status(400).json({ error: "Unknown api param; use 'huggingface' or 'freesound'." });
    }
  } catch (err) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: "Proxy failed", details: err.toString() });
  }
}