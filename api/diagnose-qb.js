// api/diagnose-qb.js - Diagnose QuickBooks configuration issues
export default async function handler(req, res) {
  const qboClientId = process.env.QBO_CLIENT_ID;
  const qboClientSecret = process.env.QBO_CLIENT_SECRET;
  const qboRefreshToken = process.env.QBO_REFRESH_TOKEN;
  const qboAccessToken = process.env.QBO_ACCESS_TOKEN;
  const qboCompanyId = process.env.QBO_COMPANY_ID;
  const qboBaseUrl = process.env.QBO_BASE_URL || 'https://quickbooks.api.intuit.com';

  const diagnosis = {
    timestamp: new Date().toISOString(),
    configuration: {
      client_id: {
        present: !!qboClientId,
        length: qboClientId?.length || 0,
        preview: qboClientId ? `${qboClientId.substring(0, 10)}...` : 'MISSING',
        looks_valid: qboClientId && qboClientId.length > 20 && !qboClientId.includes(' ')
      },
      client_secret: {
        present: !!qboClientSecret,
        length: qboClientSecret?.length || 0,
        looks_valid: qboClientSecret && qboClientSecret.length > 20 && !qboClientSecret.includes(' ')
      },
      refresh_token: {
        present: !!qboRefreshToken,
        length: qboRefreshToken?.length || 0,
        preview: qboRefreshToken ? `${qboRefreshToken.substring(0, 15)}...${qboRefreshToken.substring(qboRefreshToken.length - 10)}` : 'MISSING',
        looks_valid: qboRefreshToken && qboRefreshToken.length > 50 && !qboRefreshToken.includes(' '),
        has_whitespace: qboRefreshToken ? /\s/.test(qboRefreshToken) : false,
        has_newlines: qboRefreshToken ? /\n/.test(qboRefreshToken) : false
      },
      access_token: {
        present: !!qboAccessToken,
        length: qboAccessToken?.length || 0,
        looks_valid: qboAccessToken && qboAccessToken.length > 50
      },
      company_id: {
        present: !!qboCompanyId,
        value: qboCompanyId || 'MISSING'
      },
      base_url: {
        value: qboBaseUrl,
        is_production: qboBaseUrl.includes('quickbooks.api.intuit.com') && !qboBaseUrl.includes('sandbox'),
        is_sandbox: qboBaseUrl.includes('sandbox')
      }
    },
    token_refresh_test: null
  };

  // Test token refresh
  if (qboClientId && qboClientSecret && qboRefreshToken) {
    try {
      console.log('🧪 Testing token refresh with current credentials...');

      const credentials = Buffer.from(`${qboClientId}:${qboClientSecret}`).toString('base64');

      const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: qboRefreshToken.trim() // Trim any whitespace
        })
      });

      if (tokenResponse.ok) {
        const tokens = await tokenResponse.json();
        diagnosis.token_refresh_test = {
          success: true,
          message: 'Token refresh WORKS! ✅',
          new_token_received: !!tokens.access_token,
          expires_in: tokens.expires_in
        };
      } else {
        const errorText = await tokenResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { raw: errorText };
        }

        diagnosis.token_refresh_test = {
          success: false,
          http_status: tokenResponse.status,
          error: errorData.error || 'unknown',
          error_description: errorData.error_description || errorText,
          possible_causes: []
        };

        // Diagnose specific errors
        if (errorData.error === 'invalid_grant') {
          diagnosis.token_refresh_test.possible_causes.push(
            'Refresh token is invalid, expired, or revoked',
            'Client ID/Secret don\'t match the app that issued the token',
            'Token may have been issued for sandbox but you\'re using production credentials (or vice versa)',
            'App may have been disconnected from QuickBooks company settings'
          );
        } else if (errorData.error === 'invalid_client') {
          diagnosis.token_refresh_test.possible_causes.push(
            'Client ID or Client Secret is wrong',
            'Credentials may have extra spaces or newlines'
          );
        }
      }

    } catch (error) {
      diagnosis.token_refresh_test = {
        success: false,
        error: 'Network or system error',
        message: error.message
      };
    }
  } else {
    diagnosis.token_refresh_test = {
      success: false,
      error: 'Missing required credentials',
      message: 'Cannot test - QBO_CLIENT_ID, QBO_CLIENT_SECRET, or QBO_REFRESH_TOKEN not set'
    };
  }

  // Recommendations
  diagnosis.recommendations = [];

  if (!diagnosis.configuration.client_id.looks_valid) {
    diagnosis.recommendations.push('⚠️ Client ID looks invalid - check for truncation or extra spaces');
  }
  if (!diagnosis.configuration.client_secret.looks_valid) {
    diagnosis.recommendations.push('⚠️ Client Secret looks invalid - check for truncation or extra spaces');
  }
  if (diagnosis.configuration.refresh_token.has_whitespace) {
    diagnosis.recommendations.push('🚨 Refresh token contains whitespace - this will cause failures! Remove spaces/newlines.');
  }
  if (!diagnosis.configuration.refresh_token.looks_valid) {
    diagnosis.recommendations.push('⚠️ Refresh token looks invalid - check for truncation or extra spaces');
  }
  if (diagnosis.token_refresh_test && !diagnosis.token_refresh_test.success) {
    diagnosis.recommendations.push('🔧 Run manual re-authentication at: https://membershiprenewal.campusstores.ca/qbo-oauth-helper.html');
  }

  res.status(200).json(diagnosis);
}
