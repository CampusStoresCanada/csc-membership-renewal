// api/stripe-webhook.js - Handle Stripe payment webhook events
import Stripe from 'stripe';
import { sendBookkeeperNotification } from './lib/ses-mailer.js';

export const config = {
  api: {
    bodyParser: false, // Stripe requires raw body for signature verification
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    console.error('❌ Missing Stripe webhook configuration');
    res.status(500).json({ error: 'Webhook configuration missing' });
    return;
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    // Get raw body for signature verification
    const buf = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed:', err.message);
      res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
      return;
    }

    console.log('🎣 Stripe webhook event received:', event.type);

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      console.log('💰 Payment completed for session:', session.id);
      console.log('📧 Customer email:', session.customer_email);
      console.log('💵 Amount paid:', session.amount_total / 100, session.currency.toUpperCase());

      // Get metadata from session
      const {
        notion_token,
        organization_name,
        qbo_invoice_id,
        qbo_invoice_number,
        institution_size,
        billing_display,
        membership_fee,
        conference_total,
        paid_attendees,
        free_attendees
      } = session.metadata;

      // Update Notion with payment status
      if (notion_token) {
        console.log('💾 Updating Notion with payment confirmation...');
        try {
          await updateNotionWithPayment(notion_token, session.id, session.payment_intent);
          console.log('✅ Notion updated with payment info');
        } catch (notionError) {
          console.error('⚠️ Failed to update Notion:', notionError);
          // Continue processing - this is not critical
        }
      }

      // Retrieve full payment intent for more details
      let paymentIntent;
      if (session.payment_intent) {
        try {
          paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
          console.log('💳 Payment method:', paymentIntent.payment_method_types[0]);
        } catch (err) {
          console.error('⚠️ Failed to retrieve payment intent:', err);
        }
      }

      // Send bookkeeper notification
      console.log('📧 Sending bookkeeper notification for Stripe payment...');
      try {
        await sendBookkeeperNotification({
          organizationName: organization_name,
          invoiceId: qbo_invoice_id || session.id,
          invoiceNumber: qbo_invoice_number || `STRIPE-${session.id.slice(-8)}`,
          invoiceUrl: `https://dashboard.stripe.com/payments/${session.payment_intent}`,
          billingDisplay: billing_display,
          institutionSize: institution_size,
          membershipFee: parseFloat(membership_fee) || 0,
          conferenceTotal: parseFloat(conference_total) || 0,
          conferenceHST: 0, // Stripe handles tax automatically
          conferenceAttendees: {
            paid: parseInt(paid_attendees) || 0,
            free: parseInt(free_attendees) || 0,
            breakdown: [] // Would need to pass this through metadata if needed
          },
          totalAmount: session.amount_total / 100,
          customerAddress: {
            province: session.customer_details?.address?.state || ''
          },
          paymentMethod: 'Stripe',
          stripeSessionId: session.id,
          stripePaymentIntent: session.payment_intent
        });
        console.log('✅ Bookkeeper notification sent');
      } catch (emailError) {
        console.error('⚠️ Failed to send bookkeeper notification:', emailError);
        // Don't fail webhook - payment was successful
      }

      res.status(200).json({ received: true, session_id: session.id });
    } else {
      // Other event types - just acknowledge
      console.log('ℹ️ Unhandled event type:', event.type);
      res.status(200).json({ received: true, event_type: event.type });
    }

  } catch (error) {
    console.error('💥 Webhook processing failed:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
}

// Get raw body from request (required for Stripe signature verification)
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Update Notion page with payment confirmation and add member tag
async function updateNotionWithPayment(token, sessionId, paymentIntentId) {
  const notionApiKey = process.env.NOTION_API_KEY;

  if (!notionApiKey) {
    throw new Error('NOTION_API_KEY not configured');
  }

  const pageId = token;

  // Update with payment info and add "25/26 Member" tag
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${notionApiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      properties: {
        'Stripe Payment Intent': {
          rich_text: [{
            text: { content: paymentIntentId || sessionId }
          }]
        },
        'Payment Status': {
          select: {
            name: 'Paid'
          }
        },
        'Tags': {
          multi_select: [
            { name: '25/26 Member' }
          ]
        },
        'Payment Date': {
          date: {
            start: new Date().toISOString()
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion update failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}
