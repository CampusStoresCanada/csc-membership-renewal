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

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl,
      customer_email: organizationData.primaryContact?.workEmail,
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
      // Enable automatic tax calculation for Canadian provinces
      automatic_tax: {
        enabled: true
      },
      customer_creation: 'always',
      billing_address_collection: 'required',
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

// Build Stripe line items based on billing display preference
function buildStripeLineItems(invoiceData, billingPreferences, organizationData) {
  const lineItems = [];
  const { membershipFee, conferenceTotal, institutionSize, paidAttendees, attendeeBreakdown } = invoiceData;
  const { billingDisplay } = billingPreferences;
  const province = organizationData?.address?.province || '';

  console.log('🔍 Building Stripe line items with billingDisplay:', billingDisplay);

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
    // Single line item with combined total
    // Stripe Tax will automatically apply correct provincial rates
    const totalBeforeTax = membershipFee + conferenceTotal;

    lineItems.push({
      price_data: {
        currency: 'cad',
        product: combinedProductId,
        unit_amount: Math.round(totalBeforeTax * 100), // Convert to cents
      },
      quantity: 1
    });

  } else if (billingDisplay === 'membership-conference') {
    // Two line items: membership + conference
    const membershipProductId = membershipProductMap[institutionSize];

    // Membership line
    lineItems.push({
      price_data: {
        currency: 'cad',
        product: membershipProductId,
        unit_amount: Math.round(membershipFee * 100),
      },
      quantity: 1
    });

    // Conference line (if there are attendees)
    if (conferenceTotal > 0 && paidAttendees > 0) {
      lineItems.push({
        price_data: {
          currency: 'cad',
          product: conferenceProductId,
          unit_amount: Math.round((conferenceTotal / paidAttendees) * 100), // Per attendee
        },
        quantity: paidAttendees
      });
    }

  } else {
    // Individual line per attendee (default for 'individual-line-items' or any other mode)
    const membershipProductId = membershipProductMap[institutionSize];

    console.log('🔍 Individual items mode - billingDisplay:', billingDisplay);

    // Membership line
    lineItems.push({
      price_data: {
        currency: 'cad',
        product: membershipProductId,
        unit_amount: Math.round(membershipFee * 100),
      },
      quantity: 1
    });

    // Individual attendee lines
    if (attendeeBreakdown && attendeeBreakdown.length > 0) {
      const paidAttendeesList = attendeeBreakdown.filter(a => a.category === 'paid');
      console.log('👥 Found', paidAttendeesList.length, 'paid attendees for individual line items');

      paidAttendeesList.forEach(attendee => {
        const attendeeFee = conferenceTotal / paidAttendees; // Even split

        lineItems.push({
          price_data: {
            currency: 'cad',
            product: conferenceProductId,
            unit_amount: Math.round(attendeeFee * 100)
          },
          quantity: 1,
          description: attendee.name // Show attendee name in description instead
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
  const notionApiKey = process.env.NOTION_API_KEY;

  if (!notionApiKey) {
    throw new Error('NOTION_API_KEY not configured');
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
