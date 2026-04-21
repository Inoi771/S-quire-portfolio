import { handleApiCall } from './router.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://fir-quire.web.app',
  'Content-Type': 'application/json'
};

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: CORS_HEADERS
      });
    }

    try {
      const text = await request.text();
      const body = JSON.parse(text);
      const result = await handleApiCall(body, env);
      return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
    } catch (e) {
      console.error('handleApiCall error:', e.message);
      const status = (typeof e.status === 'number') ? e.status : 500;
      return new Response(JSON.stringify({ __gasError: e.message }), {
        status,
        headers: CORS_HEADERS
      });
    }
  }
};
