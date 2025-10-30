// api/qbo-oauth-callback.js - Handle QuickBooks OAuth callback
export default async function handler(req, res) {
  console.log('📥 QuickBooks OAuth callback received');

  const { code, realmId, state, error } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('❌ OAuth error:', error);
    res.status(400).json({
      success: false,
      error: 'OAuth authorization failed',
      message: req.query.error_description || error
    });
    return;
  }

  // Validate required parameters
  if (!code || !realmId) {
    console.error('❌ Missing code or realmId');
    res.status(400).json({
      success: false,
      error: 'Missing required parameters',
      message: 'Authorization code and realm ID are required'
    });
    return;
  }

  const qboClientId = process.env.QBO_CLIENT_ID;
  const qboClientSecret = process.env.QBO_CLIENT_SECRET;

  if (!qboClientId || !qboClientSecret) {
    console.error('❌ Missing QB credentials');
    res.status(500).json({
      success: false,
      error: 'Server configuration error',
      message: 'QuickBooks credentials not configured'
    });
    return;
  }

  try {
    console.log('🔄 Exchanging authorization code for tokens...');

    const credentials = Buffer.from(`${qboClientId}:${qboClientSecret}`).toString('base64');
    const redirectUri = `${req.headers.origin || 'https://membershiprenewal.campusstores.ca'}/api/qbo-oauth-callback`;

    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', tokenResponse.status, errorText);

      res.status(tokenResponse.status).json({
        success: false,
        error: 'Token exchange failed',
        message: 'Failed to exchange authorization code for tokens',
        details: errorText
      });
      return;
    }

    const tokens = await tokenResponse.json();
    console.log('✅ Tokens received successfully');

    // Return tokens as JSON (for programmatic use) or HTML (for manual copy-paste)
    const acceptHeader = req.headers.accept || '';

    if (acceptHeader.includes('application/json')) {
      res.status(200).json({
        success: true,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        realmId: realmId,
        expiresIn: tokens.expires_in,
        tokenType: tokens.token_type
      });
    } else {
      // Return HTML page for manual token copy
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>QuickBooks OAuth - Success</title>
          <style>
            body { font-family: system-ui; max-width: 900px; margin: 50px auto; padding: 20px; }
            .success { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
            pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
            button { background: #0077cc; color: white; border: none; padding: 10px 20px; margin: 5px; border-radius: 5px; cursor: pointer; }
            button:hover { background: #005fa3; }
          </style>
        </head>
        <body>
          <div class="success">
            <h1>✅ QuickBooks Authentication Successful!</h1>
            <p><strong>Realm ID (Company ID):</strong> <code>${realmId}</code></p>
            <p><strong>Token Type:</strong> ${tokens.token_type}</p>
            <p><strong>Expires In:</strong> ${Math.floor(tokens.expires_in / 3600)} hours</p>

            <h2>🔧 Update These Environment Variables in Vercel:</h2>

            <h3>1. QBO_ACCESS_TOKEN</h3>
            <pre id="accessToken">${tokens.access_token}</pre>
            <button onclick="copyToClipboard('accessToken', 'QBO_ACCESS_TOKEN')">Copy Access Token</button>

            <h3>2. QBO_REFRESH_TOKEN</h3>
            <pre id="refreshToken">${tokens.refresh_token}</pre>
            <button onclick="copyToClipboard('refreshToken', 'QBO_REFRESH_TOKEN')">Copy Refresh Token</button>

            <h3>3. QBO_COMPANY_ID</h3>
            <pre id="realmId">${realmId}</pre>
            <button onclick="copyToClipboard('realmId', 'QBO_COMPANY_ID')">Copy Company ID</button>

            <h2>📋 Next Steps:</h2>
            <ol>
              <li>Go to your Vercel project dashboard</li>
              <li>Navigate to Settings → Environment Variables</li>
              <li>Update the three variables above using the copy buttons</li>
              <li>Redeploy your application (or wait for next automatic deployment)</li>
              <li>The cron job will now keep your tokens fresh automatically!</li>
            </ol>

            <p><strong>Note:</strong> After updating the environment variables in Vercel, you need to redeploy for the changes to take effect.</p>
          </div>

          <script>
            function copyToClipboard(elementId, varName) {
              const text = document.getElementById(elementId).textContent;
              navigator.clipboard.writeText(text).then(() => {
                alert(varName + ' copied to clipboard!');
              }).catch(err => {
                console.error('Failed to copy:', err);
                alert('Failed to copy. Please select and copy manually.');
              });
            }
          </script>
        </body>
        </html>
      `);
    }

  } catch (error) {
    console.error('💥 OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}
