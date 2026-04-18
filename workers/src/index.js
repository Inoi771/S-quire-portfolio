export default {
  async fetch(request, env) {
    return new Response(
      JSON.stringify({ status: 'ok', message: 'S-quire API Phase 4 stub' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
};
