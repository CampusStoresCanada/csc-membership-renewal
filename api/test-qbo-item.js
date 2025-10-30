// api/test-qbo-item.js - Test if a specific item ID exists in QuickBooks
export default async function handler(req, res) {
  const { itemId } = req.query;

  const qboAccessToken = process.env.QBO_ACCESS_TOKEN;
  const qboCompanyId = process.env.QBO_COMPANY_ID;
  const qboBaseUrl = process.env.QBO_BASE_URL || 'https://quickbooks.api.intuit.com';

  if (!qboAccessToken || !qboCompanyId) {
    res.status(500).json({ error: 'Missing QuickBooks credentials' });
    return;
  }

  const testItemId = itemId || '200000404';

  try {
    console.log(`🔍 Testing item ID: ${testItemId}`);

    // Try to fetch the specific item
    const response = await fetch(
      `${qboBaseUrl}/v3/company/${qboCompanyId}/item/${testItemId}?minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${qboAccessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const responseText = await response.text();
    console.log('Response status:', response.status);
    console.log('Response body:', responseText);

    if (!response.ok) {
      res.status(200).json({
        exists: false,
        itemId: testItemId,
        error: `Item not found or inaccessible: ${response.status}`,
        details: responseText
      });
      return;
    }

    const data = JSON.parse(responseText);
    const item = data.Item;

    res.status(200).json({
      exists: true,
      itemId: testItemId,
      item: {
        id: item.Id,
        name: item.Name,
        type: item.Type,
        active: item.Active,
        description: item.Description || '',
        unitPrice: item.UnitPrice || 0,
        incomeAccountRef: item.IncomeAccountRef
      }
    });

  } catch (error) {
    console.error('❌ Error testing item:', error);
    res.status(500).json({
      error: 'Failed to test item',
      details: error.message
    });
  }
}
