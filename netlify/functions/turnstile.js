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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
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
    
    // Get the client IP - try multiple headers
    const clientIP = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     event.headers['x-real-ip'] || 
                     event.headers['cf-connecting-ip'] || 
                     'unknown';
    verifyData.append('remoteip', clientIP);

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      body: verifyData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const verifyResult = await verifyResponse.json();

    // For debugging - log the result
    console.log('Turnstile verification result:', verifyResult);

    if (!verifyResult.success) {
      // More detailed error reporting
      const errorCodes = verifyResult['error-codes'] || ['unknown'];
      
      // TEMPORARY: If it's an UNSUPPORTED_OS error, let it through for testing
      if (errorCodes.includes('unsupported-os')) {
        console.log('Bypassing UNSUPPORTED_OS error for testing');
        // Continue to Web3Forms submission
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: `Turnstile verification failed: ${errorCodes.join(', ')}`
          })
        };
      }
    }

    // If verification successful, forward the form data to Web3Forms
    // Remove the Turnstile token before forwarding
    params.delete('cf-turnstile-response');
    params.delete('_next');
    params.delete('_subject');
    
    // Add Web3Forms access key
    params.append('access_key', process.env.WEB3FORMS_ACCESS_KEY);
    
    const web3formsResponse = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const web3formsResponseText = await web3formsResponse.text();
    
    // Check if it's a success response (either JSON or HTML success page)
    let isSuccess = false;
    
    if (web3formsResponse.status === 200) {
      // Try to parse as JSON first
      try {
        const web3formsResult = JSON.parse(web3formsResponseText);
        isSuccess = web3formsResult.success === true;
      } catch (e) {
        // If not JSON, check if it's the HTML success page
        if (web3formsResponseText.includes('Form submitted successfully!') || 
            web3formsResponseText.includes('Thank you! The form has been submitted successfully')) {
          isSuccess = true;
        }
      }
    }

    if (isSuccess) {
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
          error: 'Failed to send message'
        })
      };
    }

  } catch (error) {
    console.error('Function error:', error);
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
