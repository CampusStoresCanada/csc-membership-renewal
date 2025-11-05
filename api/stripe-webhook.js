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
          await updateNotionWithPayment(notion_token, session.id, session.payment_intent, organization_name);
          console.log('✅ Notion updated with payment info');
        } catch (notionError) {
          console.error('⚠️ Failed to update Notion:', notionError);

          // Send error notification - this is critical!
          try {
            await sendErrorNotification({
              subject: 'Stripe Webhook - Failed to Update Notion',
              body: `Payment was successful but failed to update Notion with payment confirmation.\n\nOrganization: ${organization_name}\nStripe Session ID: ${session.id}\nPayment Intent: ${session.payment_intent}\nAmount: $${session.amount_total / 100} ${session.currency.toUpperCase()}\nCustomer Email: ${session.customer_email}\n\nError: ${notionError.message}\n\nAction Required:\nManually update Notion page and add "25/26 Member" tag for ${organization_name}.`
            });
          } catch (emailError) {
            console.error('❌ Failed to send error notification:', emailError);
          }
        }
      } else {
        // CRITICAL: No notion_token in metadata - can't update Notion!
        console.error('❌ No notion_token in Stripe session metadata!');

        try {
          await sendErrorNotification({
            subject: 'CRITICAL: Stripe Webhook - No Notion Token',
            body: `Payment was successful but NO Notion token was found in the session metadata.\n\nOrganization: ${organization_name}\nStripe Session ID: ${session.id}\nPayment Intent: ${session.payment_intent}\nAmount: $${session.amount_total / 100} ${session.currency.toUpperCase()}\nCustomer Email: ${session.customer_email}\n\nThis means the organization CANNOT be automatically tagged as "25/26 Member".\n\nPossible causes:\n1. Notion token not passed when creating Stripe checkout session\n2. Metadata configuration error in checkout flow\n\nAction Required:\n1. Manually find ${organization_name} in Notion\n2. Add "25/26 Member" tag\n3. Update Payment Status to "Paid"\n4. Add Stripe Payment Intent: ${session.payment_intent}\n5. Investigate why notion_token was missing from metadata`
          });
        } catch (emailError) {
          console.error('❌ Failed to send error notification:', emailError);
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
async function updateNotionWithPayment(token, sessionId, paymentIntentId, organizationName) {
  const notionApiKey = process.env.NOTION_TOKEN;

  if (!notionApiKey) {
    throw new Error('NOTION_TOKEN not configured');
  }

  const pageId = token;

  // First, fetch the current page to get existing tags
  console.log('📖 Fetching current Notion page to preserve existing tags...');
  const getResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${notionApiKey}`,
      'Notion-Version': '2022-06-28'
    }
  });

  if (!getResponse.ok) {
    const errorText = await getResponse.text();

    // Send detailed error notification for fetch failures
    if (getResponse.status === 404) {
      await sendErrorNotification({
        subject: 'Stripe Webhook - Notion Page Not Found',
        body: `Payment was successful but the Notion page could not be found.\n\nOrganization: ${organizationName}\nNotion Token/Page ID: ${pageId}\nStripe Session ID: ${sessionId}\nPayment Intent: ${paymentIntentId}\n\nPossible causes:\n1. Page was deleted from Notion\n2. Invalid token was passed to Stripe\n3. Notion API key doesn't have access to this page\n\nAction Required:\nManually add "25/26 Member" tag to ${organizationName} in Notion.`
      });
    } else {
      await sendErrorNotification({
        subject: 'Stripe Webhook - Notion Fetch Failed',
        body: `Payment was successful but failed to fetch Notion page.\n\nOrganization: ${organizationName}\nNotion Token/Page ID: ${pageId}\nStripe Session ID: ${sessionId}\nPayment Intent: ${paymentIntentId}\nHTTP Status: ${getResponse.status}\n\nError: ${errorText}\n\nAction Required:\nManually add "25/26 Member" tag to ${organizationName} in Notion.`
      });
    }

    throw new Error(`Notion fetch failed: ${getResponse.status} - ${errorText}`);
  }

  const currentPage = await getResponse.json();

  // Get existing tags
  const existingTags = currentPage.properties?.Tags?.multi_select || [];
  console.log('🏷️ Existing tags:', existingTags.map(t => t.name).join(', '));

  // Add "25/26 Member" tag if not already present
  const memberTag = '25/26 Member';
  const hasMembeTag = existingTags.some(tag => tag.name === memberTag);

  const updatedTags = hasMembeTag
    ? existingTags.map(tag => ({ name: tag.name }))
    : [...existingTags.map(tag => ({ name: tag.name })), { name: memberTag }];

  console.log('🏷️ Updated tags:', updatedTags.map(t => t.name).join(', '));

  // Update with payment info and add "25/26 Member" tag (preserving existing tags)
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
          multi_select: updatedTags
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

    // Send detailed error notification for update failures
    await sendErrorNotification({
      subject: 'Stripe Webhook - Failed to Update Notion Page',
      body: `Payment was successful but failed to update the Notion page with payment info and "25/26 Member" tag.\n\nOrganization: ${organizationName}\nNotion Page ID: ${pageId}\nStripe Session ID: ${sessionId}\nPayment Intent: ${paymentIntentId}\nHTTP Status: ${response.status}\n\nError: ${errorText}\n\nTags to add: ${updatedTags.map(t => t.name).join(', ')}\n\nAction Required:\n1. Manually update payment status to "Paid" for ${organizationName}\n2. Manually add "25/26 Member" tag if not already present\n3. Add Stripe Payment Intent: ${paymentIntentId || sessionId}\n4. Set Payment Date to today's date`
    });

    throw new Error(`Notion update failed: ${response.status} - ${errorText}`);
  }

  console.log(`🎉 Successfully updated Notion page for ${organizationName} with "25/26 Member" tag!`);

  return await response.json();
}
