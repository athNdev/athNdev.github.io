exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    // Parse form data from the body
    const body = event.body;
    const params = new URLSearchParams(body);
    const turnstileToken = params.get('cf-turnstile-response');
    
    if (!turnstileToken) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Turnstile token is required' 
        })
      };
    }

    // Verify the Turnstile token with Cloudflare
    const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const verifyData = new URLSearchParams();
    verifyData.append('secret', process.env.TURNSTILE_SECRET_KEY);
    verifyData.append('response', turnstileToken);
    verifyData.append('remoteip', event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown');

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      body: verifyData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const verifyResult = await verifyResponse.json();

    if (!verifyResult.success) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Turnstile verification failed',
          details: verifyResult['error-codes'] || []
        })
      };
    }

    // If verification successful, forward the form data to Web3Forms
    // Remove the Turnstile token before forwarding
    params.delete('cf-turnstile-response');
    
    // Add Web3Forms access key
    params.append('access_key', process.env.WEB3FORMS_ACCESS_KEY);
    
    const web3formsResponse = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const web3formsResult = await web3formsResponse.json();

    if (web3formsResponse.ok && web3formsResult.success) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true, 
          message: 'Message sent successfully!' 
        })
      };
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Failed to send message',
          details: web3formsResult.message || 'Unknown error'
        })
      };
    }

  } catch (error) {
    console.error('Turnstile verification error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      })
    };
  }
};
