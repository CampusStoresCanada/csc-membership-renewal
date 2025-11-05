// api/lib/ses-mailer.js - Email Sending Utility (now using Resend)
import { Resend } from 'resend';

/**
 * Send an email using Resend
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body (plain text)
 * @param {string} options.from - Sender email address
 * @returns {Promise<Object>} - Result object with success status
 */
export async function sendEmail({ to, subject, body, from }) {
  // Get Resend API key from environment
  const resendApiKey = process.env.RESEND_API_KEY;
  const senderEmail = from || process.env.RESEND_SENDER_EMAIL || 'noreply@campusstores.ca';

  // Validate required environment variables
  if (!resendApiKey) {
    console.error('❌ Missing RESEND_API_KEY');
    return {
      success: false,
      error: 'Resend API key not configured'
    };
  }

  if (!to) {
    console.error('❌ Missing recipient email address');
    return {
      success: false,
      error: 'Recipient email address required'
    };
  }

  try {
    console.log(`📧 Sending email via Resend to: ${to}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 From: ${senderEmail}`);

    // Create Resend client
    const resend = new Resend(resendApiKey);

    // Send email
    const response = await resend.emails.send({
      from: senderEmail,
      to: to,
      subject: subject,
      text: body
    });

    console.log('✅ Email sent successfully via Resend');
    console.log('📧 Message ID:', response.data?.id || response.id);

    return {
      success: true,
      messageId: response.data?.id || response.id
    };

  } catch (error) {
    console.error('❌ Failed to send email via Resend:', error);

    // Check for common Resend errors
    if (error.message?.includes('Invalid API key')) {
      console.error('💥 Invalid Resend API key - check RESEND_API_KEY env var');
    } else if (error.message?.includes('Invalid from address')) {
      console.error('💥 Invalid sender email - must use verified domain');
    } else if (error.message?.includes('rate limit')) {
      console.error('💥 Resend rate limit exceeded');
    }

    return {
      success: false,
      error: error.message,
      errorName: error.name
    };
  }
}

/**
 * Send an error notification email
 * @param {Object} options - Error notification options
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body with error details
 * @returns {Promise<Object>} - Result object with success status
 */
export async function sendErrorNotification({ subject, body }) {
  const adminEmail = process.env.ERROR_NOTIFICATION_EMAIL || 'google@campusstores.ca';

  console.log(`🚨 Sending error notification to: ${adminEmail}`);

  return await sendEmail({
    to: adminEmail,
    subject: `[CSC Membership] ${subject}`,
    body: body
  });
}

/**
 * Send bookkeeper notification for invoice coding
 * @param {Object} invoiceDetails - Invoice details for coding breakdown
 * @returns {Promise<Object>} - Result object with success status
 */
export async function sendBookkeeperNotification(invoiceDetails) {
  const bookkeeperEmail = process.env.BOOKKEEPER_EMAIL || 'google@campusstores.ca';

  const {
    organizationName,
    invoiceId,
    invoiceNumber,
    invoiceUrl,
    billingDisplay,
    institutionSize,
    membershipFee,
    conferenceTotal,
    conferenceHST,
    conferenceAttendees,
    totalAmount,
    customerAddress
  } = invoiceDetails;

  console.log(`📊 Sending bookkeeper notification to: ${bookkeeperEmail}`);

  // Map institution size to account numbers
  const membershipAccounts = {
    'XSmall': '4114',
    'Small': '4118',
    'Medium': '4119',
    'Large': '4120',
    'XLarge': '4121'
  };

  const membershipAccount = membershipAccounts[institutionSize] || '4110';

  // Build email body
  let body = `QUICKBOOKS INVOICE CODING NOTIFICATION\n`;
  body += `========================================\n\n`;

  body += `Organization: ${organizationName}\n`;
  body += `Invoice Number: ${invoiceNumber}\n`;
  body += `QB Invoice ID: ${invoiceId}\n`;
  body += `Invoice Total: $${totalAmount.toFixed(2)}\n\n`;

  if (customerAddress) {
    body += `Billing Address:\n`;
    body += `${customerAddress.streetAddress || ''}\n`;
    body += `${customerAddress.city || ''}, ${customerAddress.province || ''} ${customerAddress.postalCode || ''}\n\n`;
  }

  body += `View Invoice: ${invoiceUrl}\n\n`;

  body += `BILLING TYPE: ${billingDisplay === 'single-item' ? 'SINGLE LINE ITEM (Combined Payment)' : 'INDIVIDUAL LINE ITEMS'}\n`;
  body += `========================================\n\n`;

  if (billingDisplay === 'single-item') {
    // Calculate taxes separately for membership and conference
    const province = customerAddress?.province || '';
    const provinceTaxRates = {
      'Ontario': 0.13, 'New Brunswick': 0.15, 'Newfoundland': 0.15,
      'Newfoundland and Labrador': 0.15, 'Nova Scotia': 0.14, 'Prince Edward Island': 0.15
    };
    const membershipTaxRate = provinceTaxRates[province] || 0.05;
    const membershipTax = membershipFee * membershipTaxRate;
    const conferenceTax = conferenceTotal * 0.13;
    const membershipTaxName = provinceTaxRates[province] ? 'HST' : 'GST';
    const membershipTaxPercent = (membershipTaxRate * 100).toFixed(0);

    body += `⚠️ CODING REQUIRED - SINGLE LINE ITEM INVOICE (TAX EXEMPT)\n`;
    body += `This invoice was billed as a single TAX-EXEMPT line in QuickBooks.\n`;
    body += `Revenue AND taxes must be split manually using the breakdown below.\n\n`;

    body += `REVENUE ALLOCATION:\n`;
    body += `-------------------\n`;
    body += `Account ${membershipAccount}: Membership ${institutionSize}\n`;
    body += `  Pre-tax Amount: $${membershipFee.toFixed(2)}\n`;
    body += `  ${membershipTaxName} (${membershipTaxPercent}%): $${membershipTax.toFixed(2)}\n`;
    body += `  Total with tax: $${(membershipFee + membershipTax).toFixed(2)}\n\n`;

    body += `Account 4210: Conference - Delegate Reg\n`;
    body += `  Pre-tax Amount: $${conferenceTotal.toFixed(2)}\n`;
    body += `  HST (13%): $${conferenceTax.toFixed(2)}\n`;
    body += `  Total with tax: $${(conferenceTotal + conferenceTax).toFixed(2)}\n`;
    body += `  Attendees: ${conferenceAttendees.paid} paid, ${conferenceAttendees.free} complimentary\n\n`;

    if (conferenceAttendees.breakdown && conferenceAttendees.breakdown.length > 0) {
      body += `Conference Attendees Detail:\n`;
      conferenceAttendees.breakdown.forEach(attendee => {
        const icon = attendee.category === 'paid' ? '💵' : '🎫';
        body += `  ${icon} ${attendee.name} - ${attendee.reason}\n`;
      });
      body += `\n`;
    }

    body += `TOTAL INVOICE AMOUNT: $${(membershipFee + membershipTax + conferenceTotal + conferenceTax).toFixed(2)}\n`;
    body += `  (Marked as tax-exempt in QuickBooks - taxes included in line total)\n\n`;

    body += `JOURNAL ENTRY NEEDED:\n`;
    body += `-------------------\n`;
    body += `Dr. Account 4110 (Combined Revenue): $${(membershipFee + membershipTax + conferenceTotal + conferenceTax).toFixed(2)}\n`;
    body += `Cr. Account ${membershipAccount} (Membership): $${membershipFee.toFixed(2)}\n`;
    body += `Cr. Account 4210 (Conference): $${conferenceTotal.toFixed(2)}\n`;
    body += `Cr. GST/HST Payable (Membership ${membershipTaxName}): $${membershipTax.toFixed(2)}\n`;
    body += `Cr. GST/HST Payable (Conference HST): $${conferenceTax.toFixed(2)}\n\n`;

  } else {
    body += `✓ NO CODING REQUIRED - LINE ITEMS SEPARATED\n`;
    body += `This invoice has individual line items already coded in QuickBooks.\n\n`;

    body += `LINE ITEM BREAKDOWN:\n`;
    body += `-------------------\n`;
    body += `Line 1: Membership ${institutionSize}\n`;
    body += `  Account: ${membershipAccount}\n`;
    body += `  Amount: $${membershipFee.toFixed(2)}\n\n`;

    if (conferenceTotal > 0) {
      body += `Line 2: Conference - Delegate Reg\n`;
      body += `  Account: 4210\n`;
      body += `  Amount: $${conferenceTotal.toFixed(2)}\n`;
      body += `  Attendees: ${conferenceAttendees.paid} paid, ${conferenceAttendees.free} complimentary\n\n`;

      if (conferenceAttendees.breakdown && conferenceAttendees.breakdown.length > 0) {
        body += `Conference Attendees Detail:\n`;
        conferenceAttendees.breakdown.forEach(attendee => {
          const icon = attendee.category === 'paid' ? '💵' : '🎫';
          body += `  ${icon} ${attendee.name} - ${attendee.reason}\n`;
        });
        body += `\n`;
      }
    }

    body += `Tax: HST - $${conferenceHST.toFixed(2)}\n`;
    body += `  (Automatically applied by QuickBooks)\n\n`;
  }

  body += `ACCOUNT REFERENCE:\n`;
  body += `-------------------\n`;
  body += `4110: Membership Revenue (Combined - default)\n`;
  body += `4114: Membership Revenue - XSmall\n`;
  body += `4118: Membership Revenue - Small\n`;
  body += `4119: Membership Revenue - Medium\n`;
  body += `4120: Membership Revenue - Large\n`;
  body += `4121: Membership Revenue - XLarge\n`;
  body += `4210: Conference - Delegate Reg\n\n`;

  body += `---\n`;
  body += `This notification was generated automatically when the invoice was created.\n`;
  body += `Timestamp: ${new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })}\n`;

  const subject = `QB Invoice ${invoiceNumber} - ${billingDisplay === 'single-item' ? 'CODING REQUIRED' : 'Info Only'} - ${organizationName}`;

  return await sendEmail({
    to: bookkeeperEmail,
    subject: `[Bookkeeper] ${subject}`,
    body: body
  });
}
