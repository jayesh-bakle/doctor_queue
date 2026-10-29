// Cloudflare Worker for TV Display
// Serves the vanilla JS TV display with env var substitution

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle the TV display route
    if (url.pathname === '/tv-display' || url.pathname === '/tv-display/') {
      try {
        // Fetch the HTML template from the repo
        const htmlResponse = await fetch('https://raw.githubusercontent.com/jayesh-bakle/doctor_queue/main/public/tv-display.html');
        let html = await htmlResponse.text();
        
        // Substitute environment variables
        html = html
          .replace('https://YOUR_PROJECT.supabase.co', env.SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co')
          .replace('YOUR_ANON_KEY', env.SUPABASE_ANON_KEY || 'YOUR_ANON_KEY');
        
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch (err) {
        console.error('TV Display error:', err);
        return new Response('TV Display Error: ' + err.message, { 
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }
    
    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }
    
    // 404 for other routes
    return new Response('Not Found', { status: 404 });
  },
};