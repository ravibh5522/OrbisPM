// Small API client bound to one API key + org.
export function makeApi({ base, key, org }) {
  return async function api(method, path, body) {
    const res = await fetch(`${base}/api/v1/orgs/${org}${path}`, {
      method,
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || text || res.statusText;
      throw new Error(`${method} ${path} -> ${res.status}: ${msg}`);
    }
    return data;
  };
}

/** Ask the API which org/user/scopes an API key belongs to. */
export async function keyInfo(base, key) {
  const res = await fetch(`${base}/api/v1/key-info`, { headers: { "X-API-Key": key } });
  if (!res.ok) return null;
  return res.json();
}
