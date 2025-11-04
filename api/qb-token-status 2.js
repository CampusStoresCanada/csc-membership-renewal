// api/qb-token-status.js - Check QuickBooks token status and health
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const qboAccessToken = process.env.QBO_ACCESS_TOKEN;
  const qboRefreshToken = process.env.QBO_REFRESH_TOKEN;
  const qboClientId = process.env.QBO_CLIENT_ID;
  const qboClientSecret = process.env.QBO_CLIENT_SECRET;
  const qboCompanyId = process.env.QBO_COMPANY_ID;
  const vercelToken = process.env.VERCEL_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;

  const status = {
    timestamp: new Date().toISOString(),
    environment_variables: {
      QBO_ACCESS_TOKEN: qboAccessToken ? `SET (${qboAccessToken.length} chars)` : 'MISSING ❌',
      QBO_REFRESH_TOKEN: qboRefreshToken ? `SET (${qboRefreshToken.length} chars)` : 'MISSING ❌',
      QBO_CLIENT_ID: qboClientId ? 'SET ✅' : 'MISSING ❌',
      QBO_CLIENT_SECRET: qboClientSecret ? 'SET ✅' : 'MISSING ❌',
      QBO_COMPANY_ID: qboCompanyId ? 'SET ✅' : 'MISSING ❌',
      VERCEL_TOKEN: vercelToken ? 'SET ✅' : 'MISSING ❌ (auto-refresh won\'t update env vars)',
      VERCEL_PROJECT_ID: vercelProjectId ? 'SET ✅' : 'MISSING ❌ (auto-refresh won\'t update env vars)',
    },
    configuration: {
      auto_refresh_enabled: !!(vercelToken && vercelProjectId),
      cron_schedule: 'Every 30 minutes (*/30 * * * *)',
      manual_refresh_url: `${req.headers.host}/api/auto-refresh-qb-tokens`
    }
  };

  // Test if access token works
  if (qboAccessToken && qboCompanyId) {
    try {
      const qboBaseUrl = process.env.QBO_BASE_URL || 'https://quickbooks.api.intuit.com';
      const testUrl = `${qboBaseUrl}/v3/company/${qboCompanyId}/companyinfo/${qboCompanyId}`;

      const testResponse = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${qboAccessToken}`,
          'Accept': 'application/json'
        }
      });

      if (testResponse.ok) {
        const companyInfo = await testResponse.json();
        status.token_test = {
          status: 'VALID ✅',
          message: 'Access token is working',
          company_name: companyInfo.CompanyInfo?.CompanyName || 'Unknown'
        };
      } else {
        status.token_test = {
          status: 'INVALID/EXPIRED ❌',
          http_status: testResponse.status,
          message: testResponse.status === 401
            ? 'Access token expired - needs refresh'
            : `QuickBooks API error: ${testResponse.status}`
        };
      }
    } catch (error) {
      status.token_test = {
        status: 'ERROR ❌',
        message: 'Failed to test token',
        error: error.message
      };
    }
  } else {
    status.token_test = {
      status: 'CANNOT TEST ❌',
      message: 'Missing QBO_ACCESS_TOKEN or QBO_COMPANY_ID'
    };
  }

  // Warnings/recommendations
  status.warnings = [];

  if (!vercelToken || !vercelProjectId) {
    status.warnings.push({
      level: 'HIGH',
      message: 'VERCEL_TOKEN or VERCEL_PROJECT_ID not set - automatic token updates will NOT work',
      action: 'Set these environment variables in Vercel dashboard'
    });
  }

  if (status.token_test.status !== 'VALID ✅') {
    status.warnings.push({
      level: 'CRITICAL',
      message: 'QuickBooks access token is invalid or expired',
      action: 'Run: curl -X POST https://membershiprenewal.campusstores.ca/api/auto-refresh-qb-tokens'
    });
  }

  if (!qboRefreshToken) {
    status.warnings.push({
      level: 'CRITICAL',
      message: 'No refresh token available - cannot auto-refresh',
      action: 'Re-authenticate via qbo-oauth-helper.html'
    });
  }

  res.status(200).json(status);
}
