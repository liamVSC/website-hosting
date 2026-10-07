export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ error: "The requested API is not configured yet." }),
        { status: 501, headers: { "content-type": "application/json" } }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
