(() => {
  const CHAT_CACHE_TTL_MS = 120000;
  const chatCache = new Map();
  const originalFetch = window.fetch.bind(window);

  function requestPayload(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!url.includes("/functions/v1/rfx-bid-api")) return null;
    if (String(init?.method || "GET").toUpperCase() !== "POST") return null;
    if (typeof init?.body !== "string") return null;
    try {
      return JSON.parse(init.body);
    } catch (_error) {
      return null;
    }
  }

  function cacheKey(payload = {}) {
    return String(payload.token || "default");
  }

  function cachedResponse(entry) {
    return new Response(entry.body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers
    });
  }

  window.fetch = async function ratewareBidRoomFetch(input, init) {
    const payload = requestPayload(input, init);
    if (!payload?.action) return originalFetch(input, init);

    const key = cacheKey(payload);

    if (payload.action === "post_bid_room_chat_message") {
      chatCache.delete(key);
      return originalFetch(input, init);
    }

    if (payload.action !== "list_bid_room_chat") {
      return originalFetch(input, init);
    }

    const cached = chatCache.get(key);
    if (cached && Date.now() - cached.cachedAt < CHAT_CACHE_TTL_MS) {
      return cachedResponse(cached);
    }

    const response = await originalFetch(input, init);
    if (!response.ok) return response;

    const clone = response.clone();
    const body = await clone.text();
    const entry = {
      body,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      cachedAt: Date.now()
    };
    chatCache.set(key, entry);
    return response;
  };
})();
