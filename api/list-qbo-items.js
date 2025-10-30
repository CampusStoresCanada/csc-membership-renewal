// api/list-qbo-items.js - List all QuickBooks items for reference
export default async function handler(req, res) {
  const qboAccessToken = process.env.QBO_ACCESS_TOKEN;
  const qboCompanyId = process.env.QBO_COMPANY_ID;
  const qboBaseUrl = process.env.QBO_BASE_URL || 'https://quickbooks.api.intuit.com';

  if (!qboAccessToken || !qboCompanyId) {
    res.status(500).json({ error: 'Missing QuickBooks credentials' });
    return;
  }

  try {
    console.log('📋 Fetching QuickBooks items...');

    // Query all items
    const query = "SELECT * FROM Item WHERE Type = 'Service' OR Type = 'NonInventory' MAXRESULTS 100";
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
    const items = data.QueryResponse?.Item || [];

    console.log(`✅ Found ${items.length} items`);

    // Format items for display
    const formattedItems = items.map(item => ({
      id: item.Id,
      name: item.Name,
      type: item.Type,
      active: item.Active,
      description: item.Description || '',
      unitPrice: item.UnitPrice || 0,
      incomeAccountRef: item.IncomeAccountRef?.name || ''
    }));

    // Sort by name
    formattedItems.sort((a, b) => a.name.localeCompare(b.name));

    // Return HTML table
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QuickBooks Items</title>
        <style>
          body { font-family: system-ui; max-width: 1200px; margin: 50px auto; padding: 20px; }
          h1 { color: #2d7a3e; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; font-weight: 600; position: sticky; top: 0; }
          tr:hover { background: #f9f9f9; }
          .inactive { color: #999; }
          code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
          .filter { margin: 20px 0; }
          .filter input { padding: 8px; width: 300px; font-size: 14px; }
        </style>
      </head>
      <body>
        <h1>📋 QuickBooks Items</h1>
        <p>Found <strong>${items.length}</strong> items in your QuickBooks account.</p>

        <div class="filter">
          <input type="text" id="searchBox" placeholder="Search items by name..." onkeyup="filterTable()">
        </div>

        <table id="itemsTable">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Unit Price</th>
              <th>Income Account</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${formattedItems.map(item => `
              <tr class="${item.active ? '' : 'inactive'}">
                <td><code>${item.id}</code></td>
                <td>${item.name}</td>
                <td>${item.type}</td>
                <td>$${item.unitPrice.toFixed(2)}</td>
                <td>${item.incomeAccountRef}</td>
                <td>${item.active ? '✅ Active' : '❌ Inactive'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Items Currently Needed in Code:</h2>
        <ul>
          <li><strong>Membership 2025-2026 - XSmall</strong> - Currently using ID: <code>200000304</code></li>
          <li><strong>Membership 2025-2026 - Small</strong> - Currently using ID: <code>200000404</code></li>
          <li><strong>Membership 2025-2026 - Medium</strong> - Currently using ID: <code>200000309</code></li>
          <li><strong>Membership 2025-2026 - Large</strong> - Currently using ID: <code>200000205</code></li>
          <li><strong>Membership 2025-2026 - XLarge</strong> - Currently using ID: <code>200000210</code></li>
          <li><strong>Membership 2025-2026</strong> (flexible/combined) - Currently using ID: <code>200000312</code></li>
          <li><strong>Conference Registration</strong> - Currently using ID: <code>200000504</code></li>
        </ul>

        <p><strong>Action Required:</strong> Either create these items in QuickBooks with the exact names above, or update the code to use the IDs from the table above.</p>

        <script>
          function filterTable() {
            const input = document.getElementById('searchBox');
            const filter = input.value.toLowerCase();
            const table = document.getElementById('itemsTable');
            const rows = table.getElementsByTagName('tr');

            for (let i = 1; i < rows.length; i++) {
              const nameCell = rows[i].getElementsByTagName('td')[1];
              if (nameCell) {
                const txtValue = nameCell.textContent || nameCell.innerText;
                rows[i].style.display = txtValue.toLowerCase().indexOf(filter) > -1 ? '' : 'none';
              }
            }
          }
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Error fetching items:', error);
    res.status(500).json({
      error: 'Failed to fetch QuickBooks items',
      details: error.message
    });
  }
}
