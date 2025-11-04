# Stripe Integration Setup Guide

## Environment Variables Required

Add these to your Vercel environment variables (or `.env` for local testing):

```bash
# Stripe API Keys (Production)
STRIPE_SECRET_KEY=sk_live_...           # From https://dashboard.stripe.com/apikeys
STRIPE_WEBHOOK_SECRET=whsec_...         # From webhook endpoint setup (see below)

# Stripe Product IDs (from Products page)
STRIPE_PRODUCT_MEMBERSHIP_XSMALL=prod_...
STRIPE_PRODUCT_MEMBERSHIP_SMALL=prod_...
STRIPE_PRODUCT_MEMBERSHIP_MEDIUM=prod_...
STRIPE_PRODUCT_MEMBERSHIP_LARGE=prod_...
STRIPE_PRODUCT_MEMBERSHIP_XLARGE=prod_...
STRIPE_PRODUCT_CONFERENCE=prod_...
STRIPE_PRODUCT_COMBINED=prod_...        # For single-item billing mode

# Success/Cancel URLs
STRIPE_SUCCESS_URL=https://membershiprenewal.campusstores.ca/success
STRIPE_CANCEL_URL=https://membershiprenewal.campusstores.ca
```

## Stripe Dashboard Setup Steps

### 1. Get API Keys
- Go to: https://dashboard.stripe.com/apikeys
- Copy your **Secret key** (starts with `sk_live_...`)
- Add to environment as `STRIPE_SECRET_KEY`

### 2. Create Products
Go to: https://dashboard.stripe.com/products

Create 7 products with these settings:
- **Name:** [Product Name from list above]
- **Pricing:** One-time payment
- **Price:** Leave as custom or set to $0 (we set dynamically in code)
- Copy the **Product ID** (`prod_...`) after creating each

### 3. Configure Tax Settings (Important!)
Go to: https://dashboard.stripe.com/settings/tax

Enable **Stripe Tax** for Canadian provinces:
- Enable automatic tax calculation
- Set business location as Canada
- Configure provincial tax rates (or let Stripe handle automatically)

### 4. Set Up Webhook Endpoint
Go to: https://dashboard.stripe.com/webhooks

- Click **"Add endpoint"**
- URL: `https://membershiprenewal.campusstores.ca/api/stripe-webhook`
- Events to listen for:
  - `checkout.session.completed`
- Copy the **Signing secret** (starts with `whsec_...`)
- Add to environment as `STRIPE_WEBHOOK_SECRET`

### 5. Test Mode vs Production
- Start with **test mode** keys (`sk_test_...`) for initial testing
- Use test card: `4242 4242 4242 4242` (any future expiry, any CVC)
- Switch to production keys when ready to go live

## Migration Strategy

This integration runs **in parallel** with QuickBooks:
1. QuickBooks still creates invoices for bookkeeper records
2. Stripe handles actual payment collection
3. Webhook updates Notion when payment completes
4. Bookkeeper gets email with both QB invoice # and Stripe payment ID

## Next Steps After Setup
1. Add all environment variables to Vercel
2. Test checkout flow in test mode
3. Verify webhook receives payment events
4. Check Notion updates correctly
5. Switch to production keys
