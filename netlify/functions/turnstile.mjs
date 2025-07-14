export default async (req, context) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await req.formData();
    const turnstileToken = formData.get('cf-turnstile-response');
    
    console.log('Received form submission');
    console.log('Turnstile token present:', !!turnstileToken);
    console.log('Form data received:', Array.from(formData.entries()).map(([key, value]) => `${key}: ${value}`));

    // Verify Turnstile token if present
    if (turnstileToken) {
      console.log('Verifying Turnstile token...');
      
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
      console.log('Turnstile verification result:', verifyResult);

      // Handle UNSUPPORTED_OS error specifically
      if (!verifyResult.success) {
        const errorCodes = verifyResult['error-codes'] || [];
        if (errorCodes.includes('unsupported-os')) {
          console.log('UNSUPPORTED_OS error detected, allowing submission to proceed');
          // Don't return error for UNSUPPORTED_OS, let it proceed
        } else {
          console.log('Turnstile verification failed with errors:', errorCodes);
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Security verification failed. Please try again.',
            details: errorCodes
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        console.log('Turnstile verification successful');
      }
    } else {
      console.log('No Turnstile token provided, proceeding without verification');
    }

    // If verification successful, forward the form data to Web3Forms
    console.log('Forwarding to Web3Forms...');
    console.log('All received form data:', Array.from(formData.entries()).map(([key, value]) => `${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`));
    
    // Create clean form data for Web3Forms (only include form fields, not tokens)
    const cleanFormData = new URLSearchParams();
    
    // Add Web3Forms access key
    cleanFormData.append('access_key', process.env.WEB3FORMS_ACCESS_KEY);
    
    // Add custom subject line
    cleanFormData.append('subject', 'New contact form submission from athn.dev');
    
    // Add only the core form fields (exclude ALL Turnstile and token-related fields)
    const allowedFields = ['name', 'email', 'message'];
    for (const [key, value] of formData.entries()) {
      // Only allow specific form fields, reject anything that looks like a token
      if (allowedFields.includes(key) && !key.includes('turnstile') && !key.includes('token') && !key.includes('response')) {
        cleanFormData.append(key, value);
        console.log(`Including field: ${key} = ${value}`);
      } else {
        console.log(`Filtering out field: ${key} (${value.length} chars)`);
      }
    }
    
    console.log('Final clean form data keys:', Array.from(cleanFormData.keys()));
    
    const web3formsResponse = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: cleanFormData
    });

    const web3formsResult = await web3formsResponse.json();
    console.log('Web3Forms response:', web3formsResult);

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
