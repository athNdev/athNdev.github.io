export default async (req, context) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://athn.dev',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': 'https://athn.dev',
      }
    });
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
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': 'https://athn.dev',
            }
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
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://athn.dev',
        }
      });
    }

    // Extract clean data
    const name = formData.get('name') || '';
    const email = formData.get('email') || '';
    const message = formData.get('message') || '';
    
    console.log('Clean extracted data:');
    console.log('Name:', name);
    console.log('Email:', email);
    console.log('Message preview:', message.substring(0, 50) + '...');

    // Use RESEND API instead of Web3Forms
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'athn.dev Contact <delivered@resend.dev>', // Resend's delivered address
        to: [process.env.CONTACT_EMAIL],
        subject: `New Contact: ${name} - ${new Date().toLocaleDateString()}`, // More specific subject
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Contact Form Submission</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                New Contact Form Submission
              </h2>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #2c3e50;">Contact Details</h3>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
              </div>

              <div style="background: #fff; padding: 20px; border-left: 4px solid #3498db; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #2c3e50;">Message</h3>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; white-space: pre-wrap; font-family: Georgia, serif;">
${message}
                </div>
              </div>

              <div style="background: #e8f6ff; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0;"><strong>💬 To Reply:</strong> Simply reply to this email or use: <a href="mailto:${email}">${email}</a></p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                Sent via athn.dev contact form • ${new Date().toISOString()}
              </p>
            </div>
          </body>
          </html>
        `,
        reply_to: email // This makes replying easier
      })
    });

    const resendResult = await resendResponse.json();
    console.log('Resend API response:', resendResult);
    console.log('Email ID:', resendResult.id);
    console.log('Sent to:', process.env.CONTACT_EMAIL);

    if (resendResponse.ok) {
      console.log('Email sent successfully via Resend');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Message sent successfully!' 
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://athn.dev',
        }
      });
    } else {
      const error = await resendResponse.text();
      console.error('Resend API error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to send email',
        details: error
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://athn.dev',
        }
      });
    }

  } catch (error) {
    console.error('Email sending error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://athn.dev',
      }
    });
  }
};
