export default async (req, context) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await req.formData();
    const turnstileToken = formData.get('cf-turnstile-response');
    
    if (!turnstileToken) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Turnstile token is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the Turnstile token with Cloudflare
    const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const verifyData = new FormData();
    verifyData.append('secret', process.env.TURNSTILE_SECRET_KEY);
    verifyData.append('response', turnstileToken);
    verifyData.append('remoteip', req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown');

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      body: verifyData
    });

    const verifyResult = await verifyResponse.json();

    if (!verifyResult.success) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Turnstile verification failed',
        details: verifyResult['error-codes'] || []
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If verification successful, forward the form data to Web3Forms
    // Remove the Turnstile token before forwarding
    formData.delete('cf-turnstile-response');
    
    // Add Web3Forms access key
    formData.append('access_key', process.env.WEB3FORMS_ACCESS_KEY);
    
    const web3formsResponse = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: formData
    });

    const web3formsResult = await web3formsResponse.json();

    if (web3formsResponse.ok && web3formsResult.success) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Message sent successfully!' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to send message',
        details: web3formsResult.message || 'Unknown error'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Turnstile verification error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
