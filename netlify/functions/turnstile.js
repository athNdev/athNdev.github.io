exports.handler = async (event, context) => {
  // Add CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Log everything for debugging
  console.log('=== FUNCTION CALLED ===');
  console.log('HTTP Method:', event.httpMethod);
  console.log('Headers:', JSON.stringify(event.headers, null, 2));
  console.log('Body:', event.body);
  console.log('Environment check:');
  console.log('- TURNSTILE_SECRET_KEY exists:', !!process.env.TURNSTILE_SECRET_KEY);
  console.log('- WEB3FORMS_ACCESS_KEY exists:', !!process.env.WEB3FORMS_ACCESS_KEY);

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    console.log('Rejecting non-POST request');
    return {
      statusCode: 405,
      headers,
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
        headers,
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

    console.log('Turnstile verification request:');
    console.log('- URL:', verifyUrl);
    console.log('- Secret key (first 10 chars):', process.env.TURNSTILE_SECRET_KEY?.substring(0, 10) + '...');
    console.log('- Response token (first 10 chars):', turnstileToken?.substring(0, 10) + '...');
    console.log('- Remote IP:', event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown');

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      body: verifyData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('Turnstile API response status:', verifyResponse.status);
    console.log('Turnstile API response headers:', Object.fromEntries(verifyResponse.headers.entries()));
    
    const responseText = await verifyResponse.text();
    console.log('Turnstile API raw response:', responseText);
    
    let verifyResult;
    try {
      verifyResult = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Turnstile response as JSON:', e.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Turnstile API returned invalid response',
          details: `Status: ${verifyResponse.status}, Response: ${responseText.substring(0, 200)}`
        })
      };
    }

    if (!verifyResult.success) {
      return {
        statusCode: 400,
        headers,
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
    
    // Tell Web3Forms to return JSON instead of redirecting
    params.append('format', 'json');
    
    console.log('Sending to Web3Forms:');
    console.log('- Access key (first 10 chars):', process.env.WEB3FORMS_ACCESS_KEY?.substring(0, 10) + '...');
    console.log('- Form data:', Object.fromEntries(params.entries()));
    
    const web3formsResponse = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('Web3Forms API response status:', web3formsResponse.status);
    console.log('Web3Forms API response headers:', Object.fromEntries(web3formsResponse.headers.entries()));
    
    const web3formsResponseText = await web3formsResponse.text();
    console.log('Web3Forms API raw response:', web3formsResponseText);
    
    let web3formsResult;
    try {
      web3formsResult = JSON.parse(web3formsResponseText);
    } catch (e) {
      console.error('Failed to parse Web3Forms response as JSON:', e.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Web3Forms API returned invalid response',
          details: `Status: ${web3formsResponse.status}, Response: ${web3formsResponseText.substring(0, 200)}`
        })
      };
    }

    if (web3formsResponse.ok && web3formsResult.success) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Message sent successfully!' 
        })
      };
    } else {
      return {
        statusCode: 400,
        headers,
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
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      })
    };
  }
};
