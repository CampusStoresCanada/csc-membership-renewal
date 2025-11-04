# Stripe Integration - Next Steps

## What We Just Built

You now have a **hybrid payment system**:
- **QuickBooks**: Still creates invoices for bookkeeping and your existing workflows
- **Stripe**: Handles actual payment collection (bypasses QB Payments / Flinks entirely)

The user experience is seamless - they see one checkout flow powered by Stripe.

## Branch Status

✅ All changes committed to: `stripe-payments` branch
⚠️ **Main branch untouched** (as requested)

## Before You Can Test

### 1. Create Stripe Products (10 minutes)

Go to: https://dashboard.stripe.com/products

Create these 7 products:

| Product Name | Price Setting |
|-------------|---------------|
| Membership XSmall | One-time, Custom amount |
| Membership Small | One-time, Custom amount |
| Membership Medium | One-time, Custom amount |
| Membership Large | One-time, Custom amount |
| Membership XLarge | One-time, Custom amount |
| Conference Registration | One-time, Custom amount |
| Combined Membership & Conference | One-time, Custom amount |

**Important:** After creating each product, copy its **Product ID** (starts with `prod_...`)

### 2. Enable Stripe Tax

Go to: https://dashboard.stripe.com/settings/tax

- Click "Enable Stripe Tax"
- Set your business location as Canada
- Stripe will automatically handle provincial tax rates (GST/HST)

### 3. Add Environment Variables to Vercel

Go to: Vercel Dashboard → Your Project → Settings → Environment Variables

Add these variables:

```bash
# Stripe API Keys (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...   # We'll get this in step 4

# Stripe Product IDs (from step 1)
STRIPE_PRODUCT_MEMBERSHIP_XSMALL=prod_...
STRIPE_PRODUCT_MEMBERSHIP_SMALL=prod_...
STRIPE_PRODUCT_MEMBERSHIP_MEDIUM=prod_...
STRIPE_PRODUCT_MEMBERSHIP_LARGE=prod_...
STRIPE_PRODUCT_MEMBERSHIP_XLARGE=prod_...
STRIPE_PRODUCT_CONFERENCE=prod_...
STRIPE_PRODUCT_COMBINED=prod_...

# Success/Cancel URLs
STRIPE_SUCCESS_URL=https://membershiprenewal.campusstores.ca/success
STRIPE_CANCEL_URL=https://membershiprenewal.campusstores.ca

# Existing variables (keep these)
NOTION_API_KEY=...
QBO_CLIENT_ID=...
# ... (all your other existing env vars)
```

### 4. Set Up Stripe Webhook

**AFTER you deploy the branch to Vercel**, go to:
https://dashboard.stripe.com/webhooks

- Click "Add endpoint"
- URL: `https://membershiprenewal.campusstores.ca/api/stripe-webhook`
- Events to listen for:
  - ✅ `checkout.session.completed`
- Click "Add endpoint"
- **Copy the Signing Secret** (starts with `whsec_...`)
- Add it to Vercel as `STRIPE_WEBHOOK_SECRET`

### 5. Update Notion Database Properties

Your Notion database needs these new properties (if they don't exist):

| Property Name | Type | Description |
|--------------|------|-------------|
| Stripe Session ID | Text | Checkout session ID |
| Stripe Payment Intent | Text | Payment intent ID |
| Payment Status | Select | Options: "Pending", "Paid" |
| Payment Date | Date | When payment completed |

The "Tags" property should already exist (used for "25/26 Member" tag).

## Testing Plan

### Step 1: Deploy to Vercel (Staging Branch)

```bash
# Push the branch to GitHub
git push origin stripe-payments

# Deploy to Vercel preview URL
# (or merge to a staging branch if you have one)
```

### Step 2: Test the Full Flow

1. Go to your Vercel preview URL
2. Fill out a membership renewal form
3. Submit the form
4. **Expected behavior:**
   - Modal shows "Creating invoice and payment checkout..."
   - Two things happen behind the scenes:
     - QuickBooks invoice created (for bookkeeper)
     - Stripe checkout session created (for payment)
   - Browser opens **Stripe checkout page** (not QB)
5. Complete payment with test card: `4242 4242 4242 4242`
6. Verify success:
   - ✅ Check Notion: Organization should have "25/26 Member" tag
   - ✅ Check Notion: Stripe Session ID and Payment Intent filled in
   - ✅ Check Stripe Dashboard: Payment appears
   - ✅ Check QB: Invoice created (for bookkeeping)
   - ✅ Check Email: Bookkeeper notification sent

### Step 3: Verify Tax Calculation

Test with different provinces to ensure tax is calculated correctly:
- Ontario → 13% HST
- BC → 5% GST
- Nova Scotia → 14% HST
- New Brunswick → 15% HST

### Step 4: Test All Billing Modes

1. **Single-item mode**: Combined membership + conference in one line
2. **Membership-conference mode**: Two separate line items
3. **Individual-items mode**: One line per attendee

## Going to Production

Once testing is successful:

```bash
# Merge to main
git checkout main
git merge stripe-payments
git push origin main
```

Vercel will auto-deploy. The switch from QB Payments to Stripe will be **instant**.

## What Your Bookkeeper Will See

The bookkeeper notification email will now include:
- **QB Invoice Number** (for their records)
- **Stripe Payment ID** (for reconciliation)
- **Link to Stripe Dashboard** (to view payment details)
- **All the same breakdown info** (membership fee, conference attendees, etc.)

The QB invoice will still exist for their accounting workflows - they just won't use QB for payment tracking anymore.

## Rollback Plan

If anything goes wrong:

```bash
# Switch back to main branch
git checkout main

# Or in Vercel, redeploy the previous production deployment
```

QuickBooks invoices will continue to work as before.

## Cost Comparison

**Before (QB Payments):**
- QB Payments: 2.9% + $0.25 per transaction
- Plus Flinks delay/hassle

**After (Stripe):**
- Stripe: 2.9% + $0.30 per transaction
- Instant approval, no Flinks

Basically the same cost, WAY better experience.

## Support

If you hit any issues:
1. Check browser console for error messages
2. Check Vercel logs for API errors
3. Check Stripe Dashboard → Logs for webhook issues
4. Check QuickBooks for invoice creation status

## Files Created/Modified

```
✅ api/create-stripe-checkout.js     (New - Checkout session creation)
✅ api/stripe-webhook.js             (New - Payment webhook handler)
✅ index.html                        (Modified - Frontend integration)
✅ package.json                      (Modified - Added Stripe SDK)
✅ STRIPE_SETUP.md                   (New - Detailed setup guide)
✅ NEXT_STEPS.md                     (This file)
```

## Questions?

Let me know if you need help with:
- Setting up Stripe products
- Configuring environment variables
- Testing the integration
- Anything else!

---

**Ready to bypass Flinks and get this deployed?** Follow the steps above and you'll be accepting payments through Stripe in about 30 minutes.
