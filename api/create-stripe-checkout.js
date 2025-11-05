// api/create-stripe-checkout.js - Create Stripe Checkout Session
import Stripe from 'stripe';
import { sendBookkeeperNotification } from './lib/ses-mailer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://membershiprenewal.campusstores.ca');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Stripe environment variables
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://membershiprenewal.campusstores.ca/success';
  const cancelUrl = process.env.STRIPE_CANCEL_URL || 'https://membershiprenewal.campusstores.ca';

  if (!stripeSecretKey) {
    console.error('❌ Missing Stripe API key');
    res.status(500).json({
      error: 'Stripe configuration missing',
      message: 'System configuration error. Please contact support for assistance.'
    });
    return;
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const {
      token,
      organizationData,
      invoiceData,
      billingPreferences,
      qboInvoiceId,      // QB Invoice ID from parallel QB invoice creation
      qboInvoiceNumber   // QB Invoice number for bookkeeper reference
    } = req.body;

    if (!token || !organizationData || !invoiceData) {
      res.status(400).json({ error: 'Missing required data' });
      return;
    }

    console.log('💳 Creating Stripe checkout for:', organizationData.name);
    console.log('📋 Invoice data:', invoiceData);
    console.log('⚙️ Billing preferences:', billingPreferences);

    // Build line items based on billing preference
    const lineItems = buildStripeLineItems(invoiceData, billingPreferences, organizationData);

    // Use primary contact's work email for Stripe receipt
    const actualCustomerEmail = organizationData.primaryContact?.workEmail || organizationData.email;

    console.log('📧 Stripe customer email:', actualCustomerEmail);

    // Pre-fill customer information to reduce data entry
    const customerData = {
      email: actualCustomerEmail,
      name: organizationData.name,
      metadata: {
        notion_token: token,
        organization_name: organizationData.name
      }
    };

    // Add address if available
    if (organizationData.address) {
      const addr = organizationData.address;
      customerData.address = {
        line1: addr.street || '',
        line2: addr.street2 || '',
        city: addr.city || '',
        state: addr.province || '',
        postal_code: addr.postalCode || '',
        country: 'CA' // Canada
      };
    }

    // Create Stripe Customer with pre-filled data
    console.log('👤 Creating Stripe customer with pre-filled address...');
    const customer = await stripe.customers.create(customerData);
    console.log('✅ Stripe customer created:', customer.id);

    // Create Stripe Checkout Session with pre-filled customer
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl,
      customer: customer.id, // Use pre-created customer
      metadata: {
        notion_token: token,
        organization_name: organizationData.name,
        qbo_invoice_id: qboInvoiceId || '',
        qbo_invoice_number: qboInvoiceNumber || '',
        institution_size: invoiceData.institutionSize,
        billing_display: billingPreferences.billingDisplay,
        membership_fee: invoiceData.membershipFee,
        conference_total: invoiceData.conferenceTotal,
        paid_attendees: invoiceData.paidAttendees || 0,
        free_attendees: invoiceData.freeAttendees || 0
      },
      payment_intent_data: {
        metadata: {
          notion_token: token,
          organization_name: organizationData.name,
          qbo_invoice_id: qboInvoiceId || '',
          qbo_invoice_number: qboInvoiceNumber || ''
        }
      },
      // Disable automatic tax - we calculate manually
      // Conference fees always use Ontario HST (13%) - event is in Ontario
      // Membership fees use organization's province tax rate
      automatic_tax: {
        enabled: false
      },
      phone_number_collection: {
        enabled: false
      }
    });

    console.log('✅ Stripe Checkout Session created:', session.id);

    // Save Stripe Session ID to Notion for webhook matching
    console.log('💾 Saving Stripe Session ID to Notion...');
    try {
      await saveStripeSessionToNotion(token, session.id, qboInvoiceId, qboInvoiceNumber);
      console.log('✅ Stripe Session ID saved to Notion');
    } catch (notionError) {
      console.error('⚠️ Failed to save Session ID to Notion:', notionError);
      // Don't fail the whole request - checkout session was created successfully
    }

    res.status(200).json({
      success: true,
      message: 'Stripe checkout session created',
      sessionId: session.id,
      checkoutUrl: session.url,
      qboInvoiceId: qboInvoiceId,
      qboInvoiceNumber: qboInvoiceNumber
    });

  } catch (error) {
    console.error('💥 Stripe checkout creation failed:', error);

    res.status(500).json({
      success: false,
      error: 'Stripe checkout creation failed',
      message: 'Unable to create payment session at this time. Please try again or contact support if the issue persists.',
      details: error.message
    });
  }
}

// Get tax rate for a province
function getTaxRateForProvince(province) {
  const provinceTaxRates = {
    'Ontario': 0.13,           // HST ON 13%
    'New Brunswick': 0.15,     // HST NB 15%
    'Newfoundland': 0.15,      // HST NL 15%
    'Newfoundland and Labrador': 0.15,  // HST NL 15%
    'Nova Scotia': 0.14,       // HST NS 14% (2025)
    'Prince Edward Island': 0.15 // HST PE 15%
  };

  // All other provinces/territories: GST 5% (BC, AB, SK, MB, QC, YT, NT, NU)
  return provinceTaxRates[province] || 0.05;
}

// Build Stripe line items based on billing display preference
function buildStripeLineItems(invoiceData, billingPreferences, organizationData) {
  const lineItems = [];
  const { membershipFee, conferenceTotal, institutionSize, paidAttendees, attendeeBreakdown } = invoiceData;
  const { billingDisplay } = billingPreferences;
  const province = organizationData?.address?.province || '';

  console.log('🔍 Building Stripe line items with billingDisplay:', billingDisplay);

  // Tax rates
  const membershipTaxRate = getTaxRateForProvince(province);
  const conferenceTaxRate = 0.13; // Always Ontario HST (13%) - conference is in Ontario

  console.log('💰 Tax rates - Membership:', membershipTaxRate, '(' + province + '), Conference:', conferenceTaxRate, '(Ontario)');

  // Map institution size to product IDs
  const membershipProductMap = {
    'XSmall': process.env.STRIPE_PRODUCT_MEMBERSHIP_XSMALL,
    'Small': process.env.STRIPE_PRODUCT_MEMBERSHIP_SMALL,
    'Medium': process.env.STRIPE_PRODUCT_MEMBERSHIP_MEDIUM,
    'Large': process.env.STRIPE_PRODUCT_MEMBERSHIP_LARGE,
    'XLarge': process.env.STRIPE_PRODUCT_MEMBERSHIP_XLARGE
  };

  const conferenceProductId = process.env.STRIPE_PRODUCT_CONFERENCE;
  const combinedProductId = process.env.STRIPE_PRODUCT_COMBINED;

  if (billingDisplay === 'single-item') {
    // Single line item with combined total (tax-inclusive)
    const membershipWithTax = membershipFee * (1 + membershipTaxRate);
    const conferenceWithTax = conferenceTotal * (1 + conferenceTaxRate);
    const totalWithTax = membershipWithTax + conferenceWithTax;

    lineItems.push({
      price_data: {
        currency: 'cad',
        product: combinedProductId,
        unit_amount: Math.round(totalWithTax * 100), // Convert to cents, tax included
        tax_behavior: 'inclusive' // Price includes tax
      },
      quantity: 1
    });

  } else if (billingDisplay === 'membership-conference') {
    // Two line items: membership + conference (both tax-inclusive)
    const membershipProductId = membershipProductMap[institutionSize];

    // Membership line (with provincial tax)
    const membershipWithTax = membershipFee * (1 + membershipTaxRate);
    lineItems.push({
      price_data: {
        currency: 'cad',
        product: membershipProductId,
        unit_amount: Math.round(membershipWithTax * 100), // Tax included
        tax_behavior: 'inclusive'
      },
      quantity: 1
    });

    // Conference line (if there are attendees) - with Ontario HST
    if (conferenceTotal > 0 && paidAttendees > 0) {
      const conferencePerAttendeeWithTax = (conferenceTotal / paidAttendees) * (1 + conferenceTaxRate);
      lineItems.push({
        price_data: {
          currency: 'cad',
          product: conferenceProductId,
          unit_amount: Math.round(conferencePerAttendeeWithTax * 100), // Per attendee, tax included
          tax_behavior: 'inclusive'
        },
        quantity: paidAttendees
      });
    }

  } else {
    // Individual line per attendee (default for 'individual-line-items' or any other mode) - tax-inclusive
    const membershipProductId = membershipProductMap[institutionSize];

    console.log('🔍 Individual items mode - billingDisplay:', billingDisplay);

    // Membership line (with provincial tax)
    const membershipWithTax = membershipFee * (1 + membershipTaxRate);
    lineItems.push({
      price_data: {
        currency: 'cad',
        product: membershipProductId,
        unit_amount: Math.round(membershipWithTax * 100), // Tax included
        tax_behavior: 'inclusive'
      },
      quantity: 1
    });

    // Individual attendee lines (with Ontario HST)
    if (attendeeBreakdown && attendeeBreakdown.length > 0) {
      const paidAttendeesList = attendeeBreakdown.filter(a => a.category === 'paid');
      console.log('👥 Found', paidAttendeesList.length, 'paid attendees for individual line items');

      paidAttendeesList.forEach(attendee => {
        const attendeeFee = conferenceTotal / paidAttendees; // Even split
        const attendeeFeeWithTax = attendeeFee * (1 + conferenceTaxRate);

        lineItems.push({
          price_data: {
            currency: 'cad',
            product: conferenceProductId,
            unit_amount: Math.round(attendeeFeeWithTax * 100), // Tax included
            tax_behavior: 'inclusive'
          },
          quantity: 1
          // Note: Attendee name will show in metadata/receipt, not per-line-item
        });
      });
    } else {
      console.log('⚠️ No attendee breakdown provided - skipping individual conference lines');
    }
  }

  console.log('✅ Built', lineItems.length, 'line items for Stripe');
  return lineItems;
}

// Save Stripe Session ID to Notion organization page
async function saveStripeSessionToNotion(token, sessionId, qboInvoiceId, qboInvoiceNumber) {
  const notionApiKey = process.env.NOTION_TOKEN;

  if (!notionApiKey) {
    throw new Error('NOTION_TOKEN not configured');
  }

  // Find the page ID from the token (token format: pageId)
  const pageId = token;

  // Update the Notion page with Stripe Session ID
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${notionApiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      properties: {
        'Stripe Session ID': {
          rich_text: [{
            text: { content: sessionId }
          }]
        },
        ...(qboInvoiceId && {
          'QB Invoice ID': {
            rich_text: [{
              text: { content: qboInvoiceId }
            }]
          }
        }),
        ...(qboInvoiceNumber && {
          'QB Invoice Number': {
            rich_text: [{
              text: { content: qboInvoiceNumber }
            }]
          }
        })
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion update failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}
