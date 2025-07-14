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
      console.log('No Turnstile token provided - BLOCKING submission');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Security verification required. Please complete the verification and try again.',
        details: ['missing-input-response']
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If verification successful, forward the form data to Web3Forms
    console.log('Forwarding to Web3Forms...');
    
    // EXTRACT ONLY WHAT WE NEED IMMEDIATELY
    const extractedName = formData.get('name');
    const extractedEmail = formData.get('email');
    const extractedMessage = formData.get('message');
    
    // DESTROY REFERENCE TO ORIGINAL FORM DATA
    // formData = null; // Can't do this, but we won't use it anymore
    
    console.log('Manual extraction:');
    console.log('Name:', extractedName);
    console.log('Email:', extractedEmail);
    console.log('Message:', extractedMessage ? extractedMessage.substring(0, 50) + '...' : 'null');
    
    // Create COMPLETELY FRESH URLSearchParams - NO CONNECTION TO ORIGINAL DATA
    const cleanSubmission = new URLSearchParams();
    cleanSubmission.set('access_key', process.env.WEB3FORMS_ACCESS_KEY);
    cleanSubmission.set('subject', 'New contact form submission from athn.dev');
    cleanSubmission.set('name', extractedName || '');
    cleanSubmission.set('email', extractedEmail || '');
    cleanSubmission.set('message', extractedMessage || '');
    
    console.log('Sending to Web3Forms - ONLY these fields:', Array.from(cleanSubmission.keys()));
    console.log('Sending to Web3Forms - field values:');
    for (const [key, value] of cleanSubmission.entries()) {
      console.log(`  ${key}: ${key === 'access_key' ? '[HIDDEN]' : value}`);
    }
    
    const web3formsResponse = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: cleanSubmission
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
