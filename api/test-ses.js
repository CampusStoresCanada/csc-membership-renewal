// api/test-ses.js - Test AWS SES configuration
import { sendEmail } from './lib/ses-mailer.js';

export default async function handler(req, res) {
  console.log('🧪 Testing AWS SES configuration...');

  // Check environment variables
  const hasAccessKey = !!process.env.AWS_ACCESS_KEY_ID;
  const hasSecretKey = !!process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_SES_REGION || process.env.S3_REGION || 'us-east-1';
  const senderEmail = process.env.AWS_SES_SENDER_EMAIL || 'noreply@campusstores.ca';
  const testRecipient = req.query.to || process.env.ERROR_NOTIFICATION_EMAIL || 'steve@campusstores.ca';

  const config = {
    hasAccessKey,
    hasSecretKey,
    accessKeyLength: process.env.AWS_ACCESS_KEY_ID?.length || 0,
    region,
    senderEmail,
    testRecipient
  };

  console.log('📋 SES Configuration:', config);

  if (!hasAccessKey || !hasSecretKey) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SES Test - Missing Credentials</title>
        <style>
          body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; }
          code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>❌ Missing AWS Credentials</h1>
          <p>Required environment variables are not set:</p>
          <ul>
            <li><code>AWS_ACCESS_KEY_ID</code>: ${hasAccessKey ? '✅ Set' : '❌ Missing'}</li>
            <li><code>AWS_SECRET_ACCESS_KEY</code>: ${hasSecretKey ? '✅ Set' : '❌ Missing'}</li>
          </ul>
          <p>Add these to your Vercel project environment variables.</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Try to send a test email
  try {
    console.log(`📧 Attempting to send test email from ${senderEmail} to ${testRecipient}...`);

    const result = await sendEmail({
      to: testRecipient,
      from: senderEmail,
      subject: '[TEST] CSC Membership System - SES Test',
      body: `This is a test email from the CSC Membership Renewal system.

If you received this, AWS SES is configured correctly!

Configuration:
- Region: ${region}
- Sender: ${senderEmail}
- Timestamp: ${new Date().toISOString()}

You can ignore this email.`
    });

    if (result.success) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>SES Test - Success</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
            .success { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; }
            .info { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; margin: 20px 0; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="success">
            <h1>✅ Email Sent Successfully!</h1>
            <p><strong>Message ID:</strong> <code>${result.messageId}</code></p>
            <p>Check <strong>${testRecipient}</strong> for the test email.</p>
          </div>
          <div class="info">
            <h3>Configuration:</h3>
            <ul>
              <li><strong>Region:</strong> ${region}</li>
              <li><strong>Sender:</strong> ${senderEmail}</li>
              <li><strong>Recipient:</strong> ${testRecipient}</li>
            </ul>
          </div>
        </body>
        </html>
      `);
    } else {
      throw new Error(result.error || 'Unknown error');
    }

  } catch (error) {
    console.error('❌ SES Test failed:', error);

    let errorHelp = '';

    if (error.name === 'MessageRejected' || error.message?.includes('not verified')) {
      errorHelp = `
        <h3>🔍 Email Not Verified</h3>
        <p>The sender email <code>${senderEmail}</code> is not verified in AWS SES.</p>
        <h4>To fix this:</h4>
        <ol>
          <li>Go to AWS SES Console → Verified Identities</li>
          <li>Click "Create Identity"</li>
          <li>Choose "Email address" or "Domain"</li>
          <li>Enter: <code>${senderEmail}</code> or <code>campusstores.ca</code></li>
          <li>Check your email or DNS records for verification</li>
        </ol>
      `;
    } else if (error.message?.includes('sandbox') || error.name === 'AccessDenied') {
      errorHelp = `
        <h3>🔍 SES Sandbox Mode</h3>
        <p>Your AWS SES account might be in sandbox mode.</p>
        <h4>In sandbox mode:</h4>
        <ul>
          <li>You can only send TO verified email addresses</li>
          <li>You must verify BOTH sender and recipient</li>
        </ul>
        <h4>To fix this:</h4>
        <ol>
          <li>Go to AWS SES Console → Account Dashboard</li>
          <li>Check if you're in "Sandbox" mode</li>
          <li>Either:
            <ul>
              <li>Verify the recipient email: <code>${testRecipient}</code></li>
              <li>OR request production access (takes 24hrs)</li>
            </ul>
          </li>
        </ol>
      `;
    } else if (error.message?.includes('InvalidClientTokenId') || error.message?.includes('security token')) {
      errorHelp = `
        <h3>🔍 Invalid AWS Credentials</h3>
        <p>The AWS access keys are invalid or expired.</p>
        <h4>To fix this:</h4>
        <ol>
          <li>Go to AWS Console → IAM → Users</li>
          <li>Find your user (or create one with SES permissions)</li>
          <li>Go to Security Credentials → Create Access Key</li>
          <li>Copy the new keys to Vercel environment variables</li>
        </ol>
      `;
    }

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SES Test - Failed</title>
        <style>
          body { font-family: system-ui; max-width: 900px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; }
          .info { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; margin: 20px 0; }
          code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
          pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>❌ Email Send Failed</h1>
          <p><strong>Error:</strong> ${error.message}</p>
          <p><strong>Error Type:</strong> ${error.name || 'Unknown'}</p>
        </div>

        ${errorHelp}

        <div class="info">
          <h3>Current Configuration:</h3>
          <ul>
            <li><strong>Region:</strong> ${region}</li>
            <li><strong>Sender:</strong> ${senderEmail}</li>
            <li><strong>Recipient:</strong> ${testRecipient}</li>
            <li><strong>AWS Access Key ID:</strong> ${config.accessKeyLength} characters</li>
          </ul>
        </div>

        <details>
          <summary>Full Error Details</summary>
          <pre>${JSON.stringify(error, null, 2)}</pre>
        </details>
      </body>
      </html>
    `);
  }
}
