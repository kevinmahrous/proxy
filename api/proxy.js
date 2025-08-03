export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const targetUrl = req.query.link;

  if (!targetUrl) {
    return res.status(400).json({ error: "Missing 'link' query parameter." });
  }

  const isHuggingFace = targetUrl.startsWith("https://api-inference.huggingface.co/");

  if (req.method === "OPTIONS") {
    if (isHuggingFace) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).end();
    } else {
      res.status(403).json({ error: "CORS restricted to Hugging Face only." });
    }
    return;
  }

  if (!isHuggingFace) {
    return res.status(403).json({ error: "Only Hugging Face URLs are allowed." });
  }

  try {
    const method = req.method;
    let body = null;

    if (method !== "GET" && method !== "HEAD") {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      body = Buffer.concat(buffers);
    }

    const { host, connection, ...customHeaders } = req.headers;

    const proxyRes = await fetch(targetUrl, {
      method,
      headers: customHeaders,
      body: body && body.length > 0 ? body : undefined,
    });

    const contentType = proxyRes.headers.get("content-type");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", contentType || "text/plain");

    const buffer = await proxyRes.arrayBuffer();
    res.status(proxyRes.status).send(Buffer.from(buffer));
  } catch (err) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: "Proxy failed", details: err.toString() });
  }
}