// api/list-qbo-tax-codes.js - List all QuickBooks tax codes
export default async function handler(req, res) {
  const qboAccessToken = process.env.QBO_ACCESS_TOKEN;
  const qboCompanyId = process.env.QBO_COMPANY_ID;
  const qboBaseUrl = process.env.QBO_BASE_URL || 'https://quickbooks.api.intuit.com';

  if (!qboAccessToken || !qboCompanyId) {
    res.status(500).json({ error: 'Missing QuickBooks credentials' });
    return;
  }

  try {
    console.log('📋 Fetching QuickBooks tax codes...');

    // Query all tax codes
    const query = "SELECT * FROM TaxCode MAXRESULTS 100";
    const response = await fetch(
      `${qboBaseUrl}/v3/company/${qboCompanyId}/query?query=${encodeURIComponent(query)}&minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${qboAccessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QuickBooks API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const taxCodes = data.QueryResponse?.TaxCode || [];

    console.log(`✅ Found ${taxCodes.length} tax codes`);

    // Format tax codes for display
    const formattedCodes = taxCodes.map(code => ({
      id: code.Id,
      name: code.Name,
      description: code.Description || '',
      active: code.Active,
      purchaseTaxRateList: code.PurchaseTaxRateList,
      salesTaxRateList: code.SalesTaxRateList
    }));

    // Sort by name
    formattedCodes.sort((a, b) => a.name.localeCompare(b.name));

    // Return HTML table
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QuickBooks Tax Codes</title>
        <style>
          body { font-family: system-ui; max-width: 1200px; margin: 50px auto; padding: 20px; }
          h1 { color: #2d7a3e; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; font-weight: 600; position: sticky; top: 0; }
          tr:hover { background: #f9f9f9; }
          .inactive { color: #999; }
          code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
        </style>
      </head>
      <body>
        <h1>📋 QuickBooks Tax Codes</h1>
        <p>Found <strong>${taxCodes.length}</strong> tax codes in your QuickBooks account.</p>

        <table>
          <thead>
            <tr>
              <th>Tax Code ID</th>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${formattedCodes.map(code => `
              <tr class="${code.active ? '' : 'inactive'}">
                <td><code>${code.id}</code></td>
                <td>${code.name}</td>
                <td>${code.description}</td>
                <td>${code.active ? '✅ Active' : '❌ Inactive'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Tax Codes Currently Used in Code:</h2>
        <ul>
          <li><code>3</code> - GST 5%</li>
          <li><code>8</code> - HST 15% (NB, PEI)</li>
          <li><code>10</code> - HST 14% (NS)</li>
          <li><code>12</code> - HST 15% (NL)</li>
          <li><code>13</code> - HST 13% (ON - conference)</li>
          <li><code>NON</code> - Tax exempt (for single-item billing)</li>
        </ul>

        <p><strong>Check if these IDs exist above!</strong> If not, update the code with the correct IDs.</p>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Error fetching tax codes:', error);
    res.status(500).json({
      error: 'Failed to fetch QuickBooks tax codes',
      details: error.message
    });
  }
}
