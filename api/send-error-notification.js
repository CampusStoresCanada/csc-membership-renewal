// api/send-error-notification.js - Send error notifications to admin
import { sendErrorNotification } from './lib/ses-mailer.js';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { error, details, organizationName, timestamp } = req.body;

    console.log('🚨 Sending error notification for sync failure');

    // Build detailed error message
    let body = `NOTION SYNC ERROR\n`;
    body += `=================\n\n`;
    body += `A membership renewal submission failed to sync to Notion.\n\n`;

    if (organizationName) {
      body += `Organization: ${organizationName}\n`;
    }

    body += `Timestamp: ${timestamp || new Date().toISOString()}\n`;
    body += `Error: ${error || 'Unknown error'}\n\n`;

    if (details) {
      body += `Error Details:\n`;
      body += `${details}\n\n`;
    }

    body += `ACTION REQUIRED:\n`;
    body += `---------------\n`;
    body += `1. Check Vercel logs for full error details\n`;
    body += `2. Verify NOTION_API_KEY is configured correctly\n`;
    body += `3. Check Notion database permissions\n`;
    body += `4. Review network connectivity to Notion API\n\n`;

    body += `Note: QuickBooks and Stripe invoices were still created successfully.\n`;
    body += `The customer may have payment links but their data wasn't saved to Notion.\n`;

    // Send notification email
    const result = await sendErrorNotification({
      subject: 'Notion Sync Failed - Action Required',
      body: body
    });

    if (result.success) {
      console.log('✅ Error notification sent successfully');
      res.status(200).json({
        success: true,
        message: 'Error notification sent'
      });
    } else {
      console.error('❌ Failed to send error notification:', result.error);
      res.status(500).json({
        success: false,
        error: 'Failed to send notification',
        details: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error notification endpoint failed:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
