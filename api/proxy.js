export default async function handler(req, res) {
  const targetUrl = req.query.link;

  if (!targetUrl) {
    return res.status(400).json({ error: "Missing 'link' query parameter." });
  }

  try {
    const method = req.method;
    const headers = req.headers;
    const body = method !== "GET" ? req.body : null;

    const fetchRes = await fetch(targetUrl, {
      method,
      headers: {
        ...headers,
        host: new URL(targetUrl).host,
      },
      body: body ? JSON.stringify(body) : null,
    });

    const contentType = fetchRes.headers.get("content-type");
    res.setHeader("content-type", contentType || "text/plain");

    const buffer = await fetchRes.arrayBuffer();
    res.status(fetchRes.status).send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: "Fetch failed.", details: err.toString() });
  }
}