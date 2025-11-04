# GO-LIVE CHECKLIST
## CSC Membership Renewal System - Production Deployment

**Target Go-Live Date:** [Tomorrow Morning]

---

## ✅ **COMPLETED** - Code Changes for Production

### Email Configuration
- [x] Removed test email override in `api/create-qbo-invoice.js` (line 757)
  - **Changed:** Test emails going to `google@campusstores.ca`
  - **Now:** Customer invoices go to actual customer email addresses

- [x] Removed test email override in `api/email-qbo-invoice.js` (lines 43, 204)
  - **Changed:** Test emails going to `google@campusstores.ca`
  - **Now:** Customer invoices go to actual customer email addresses

- [x] Error notifications enabled for Notion sync failures
  - **Changed:** Errors were suppressed to show success page
  - **Now:** Error page shown and email alert sent when Notion sync fails

---

## ⚠️ **REQUIRED** - Environment Variables to Set in Vercel

Before going live, you **MUST** set these environment variables in your Vercel project:

### Email Notification Recipients

1. **`BOOKKEEPER_EMAIL`** (NEW - Required)
   - **What:** Email address to receive QuickBooks invoice coding instructions
   - **Example:** `accounting@campusstores.ca` or `bookkeeper@campusstores.ca`
   - **Default if not set:** Falls back to `ERROR_NOTIFICATION_EMAIL`

   **This email will receive:**
   - Invoice coding breakdown for single-item invoices (requires manual journal entry)
   - Conference attendee details
   - Account allocation instructions

2. **`ERROR_NOTIFICATION_EMAIL`** (Should Already Be Set)
   - **What:** Email address to receive system error notifications
   - **Example:** `steve@campusstores.ca` or `admin@campusstores.ca`
   - **Default if not set:** `steve@campusstores.ca`

   **This email will receive:**
   - Notion sync failure alerts
   - System errors and stack traces
   - Action-required notifications

3. **`AWS_SES_SENDER_EMAIL`** (Should Already Be Set)
   - **What:** Verified sender email address for AWS SES
   - **Example:** `noreply@campusstores.ca`
   - **Default if not set:** `noreply@campusstores.ca`
   - **Important:** This email **MUST** be verified in AWS SES

### How to Set Environment Variables in Vercel

```bash
# Via Vercel Dashboard:
1. Go to: https://vercel.com/[your-team]/csc-membership-renewal/settings/environment-variables
2. Add/Update the following variables:
   - BOOKKEEPER_EMAIL = [your bookkeeper email]
   - ERROR_NOTIFICATION_EMAIL = [your admin email]
   - AWS_SES_SENDER_EMAIL = noreply@campusstores.ca

# Or via Vercel CLI:
vercel env add BOOKKEEPER_EMAIL production
vercel env add ERROR_NOTIFICATION_EMAIL production
vercel env add AWS_SES_SENDER_EMAIL production
```

---

## 🔍 **RECOMMENDED** - Pre-Launch Verification

### 1. AWS SES Configuration
- [ ] Verify that `noreply@campusstores.ca` (or your sender email) is verified in AWS SES
  - Go to: https://console.aws.amazon.com/ses/
  - Check: SES → Verified Identities → Look for your sender email

- [ ] Check if AWS SES is in **Production Mode** (not Sandbox)
  - **Sandbox Mode:** Can only send to verified emails
  - **Production Mode:** Can send to any email address
  - To check: AWS SES → Account Dashboard → Look for "Sending Status"

- [ ] If in Sandbox Mode, request production access:
  - AWS SES → Account Dashboard → "Request production access"
  - Or continue in sandbox (all customer emails must be verified first)

### 2. QuickBooks Configuration
- [ ] Confirm `QBO_BASE_URL=https://quickbooks.api.intuit.com` (production, not sandbox)
- [ ] Confirm `QBO_COMPANY_ID` matches production company realm ID
- [ ] Test QuickBooks token refresh: Visit `/api/auto-refresh-qb-tokens`
  - Should show: `"success": true`
  - If failed: Run manual re-auth at `https://membershiprenewal.campusstores.ca/qbo-oauth-helper.html`

### 3. Stripe Configuration
- [ ] Confirm using **live** Stripe keys (not test keys)
  - `STRIPE_SECRET_KEY` should start with `sk_live_...` (not `sk_test_...`)
- [ ] Verify Stripe webhook is configured for production
  - Webhook URL: `https://membershiprenewal.campusstores.ca/api/stripe-webhook`
  - Events: `checkout.session.completed`, `payment_intent.succeeded`

### 4. Test the Complete Flow (Recommended)
- [ ] Submit a test membership renewal (use a real organization or test data)
- [ ] Verify QuickBooks invoice created successfully
- [ ] Verify email sent to customer with invoice link
- [ ] Verify Stripe checkout session created
- [ ] Verify bookkeeper received invoice coding email
- [ ] Complete Stripe payment (use Stripe test card even in production mode for this test)
- [ ] Verify Stripe webhook processed payment
- [ ] Verify Notion database updated with submission
- [ ] If Notion fails, verify error email sent to admin

---

## 📋 **OPTIONAL** - Additional Production Considerations

### Monitoring & Alerts
- [ ] Set up Vercel monitoring/alerts for function errors
- [ ] Add Stripe webhook monitoring (check Stripe Dashboard → Developers → Webhooks)
- [ ] Monitor QuickBooks token refresh cron job (runs every hour)
  - Check Vercel logs: Functions → `auto-refresh-qb-tokens`

### Documentation
- [ ] Update team on new email recipients
- [ ] Document the bookkeeper's workflow for coding single-item invoices
- [ ] Share QuickBooks account mapping reference:
  ```
  4114: Membership Revenue - XSmall
  4118: Membership Revenue - Small
  4119: Membership Revenue - Medium
  4120: Membership Revenue - Large
  4121: Membership Revenue - XLarge
  4210: Conference - Delegate Reg
  ```

### Backup Plan
- [ ] Know how to quickly revert if issues arise:
  ```bash
  git checkout [previous-commit-hash]
  git push origin main --force
  ```
- [ ] Have QuickBooks login handy to manually create invoices if needed
- [ ] Have Stripe dashboard access to manually check payments

---

## 🎯 **GO/NO-GO Decision Checklist**

Before going live, confirm:

- [x] **Code Changes Complete:** Test email overrides removed ✅
- [ ] **Environment Variables Set:** `BOOKKEEPER_EMAIL`, `ERROR_NOTIFICATION_EMAIL`, `AWS_SES_SENDER_EMAIL`
- [ ] **AWS SES Verified:** Sender email verified (and production mode enabled if needed)
- [ ] **QuickBooks Connected:** Token refresh working, using production credentials
- [ ] **Stripe Live Mode:** Using live keys, webhook configured
- [ ] **Test Flow Passed:** End-to-end test completed successfully (optional but recommended)

---

## 🚀 **GO LIVE!**

Once all items above are checked:

1. **Deploy the changes** (already done - changes are on `main` branch)
2. **Set environment variables** in Vercel production
3. **Announce to team** that system is live
4. **Monitor closely** for first few submissions
5. **Check emails** are going to correct recipients

---

## 📞 **Support Contacts**

- **QuickBooks Issues:** Check `/api/diagnose-qb` for diagnostics
- **Stripe Issues:** Check Stripe Dashboard → Developers → Logs
- **Email Issues:** Check AWS SES → Sending Statistics
- **General Errors:** Check Vercel → Functions → Logs

---

## 📝 **Post-Launch Monitoring (First 48 Hours)**

- [ ] Monitor Vercel function logs for errors
- [ ] Check that customer invoices are being sent
- [ ] Verify bookkeeper is receiving invoice coding emails
- [ ] Confirm Stripe payments are processing
- [ ] Ensure Notion sync is working (or error emails are being sent)

---

**Good luck with the launch! 🎉**

**Last Updated:** November 4, 2025
