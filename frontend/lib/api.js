export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    const error = new Error("API-ul nu răspunde.");
    error.status = 0;
    throw error;
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const details = payload?.error?.details || [];
    const detailMessage = details.map((item) => item?.message).filter(Boolean).join(" ");
    const error = new Error(detailMessage || payload?.error?.message || `Cererea a eșuat (${response.status})`);
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = details;
    throw error;
  }
  return payload;
}
