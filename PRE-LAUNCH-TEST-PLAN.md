# PRE-LAUNCH TEST PLAN
## Final Test Gauntlet Before Going Live

**CRITICAL:** Run this complete test sequence before sending renewal emails to members.

---

## Test 1: QuickBooks Connection & Token Refresh

**Purpose:** Verify QB is working and tokens are fresh

### Steps:
1. Visit: `https://membershiprenewal.campusstores.ca/api/auto-refresh-qb-tokens`
2. Check response shows `"success": true`
3. Verify `expires_in_hours` is close to 1 (not near 0)

**Expected Result:**
```json
{
  "success": true,
  "message": "QuickBooks tokens refreshed successfully",
  "expires_in_hours": 1,
  ...
}
```

**If it fails:**
- Visit: `https://membershiprenewal.campusstores.ca/qbo-oauth-helper.html`
- Re-authenticate QuickBooks manually
- Run token refresh again

---

## Test 2: Email Configuration Test

**Purpose:** Verify Resend is working and emails reach the right people

### Steps:
1. Send test error notification:
```bash
curl https://membershiprenewal.campusstores.ca/api/send-error-notification \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "error": "PRE-LAUNCH TEST - This is a test error notification",
    "details": "Testing email delivery before going live",
    "organizationName": "Test Organization",
    "timestamp": "2025-11-04T08:00:00Z"
  }'
```

2. **CHECK YOUR EMAIL** at `ERROR_NOTIFICATION_EMAIL`
   - Should receive email with subject: `[CSC Membership] Notion Sync Failed - Action Required`
   - Should contain test error details

**Expected Result:**
```json
{
  "success": true,
  "message": "Error notification sent"
}
```

**If email doesn't arrive:**
- Check Resend dashboard logs: https://resend.com/logs
- Verify `RESEND_API_KEY` is set correctly in Vercel
- Verify `ERROR_NOTIFICATION_EMAIL` is set correctly
- Check spam folder

---

## Test 3: Complete End-to-End Flow (MOST CRITICAL)

**Purpose:** Test the entire membership renewal process with real data

### Preparation:
1. Pick a test organization (or use your own organization as test)
2. Have real contact info ready (use your own email for testing)
3. Be ready to check both emails: customer email AND bookkeeper email

### Steps:

#### 3A. Submit Membership Renewal Form
1. Go to: `https://membershiprenewal.campusstores.ca/`
2. Fill out form with test data:
   - **Organization:** [Test Org Name]
   - **Size:** Small (for easier testing)
   - **Email:** **YOUR EMAIL** (so you can verify customer invoice)
   - **Address:** Real address with valid province
   - **Contact Info:** Real contact details
   - **Conference Attendees:** Add 1-2 paid attendees

3. **Billing Preference:** Choose "Individual line items" (tests most complex scenario)

4. Submit form and click "Review & Submit Invoice"

#### 3B. Verify Invoice Preview
1. Invoice modal should show:
   - ✅ Membership fee (e.g., $950 for Small)
   - ✅ Membership tax line (GST 5% or HST 13-15% based on province)
   - ✅ Conference attendee lines (one per paid attendee)
   - ✅ Conference HST (13%) line
   - ✅ Correct subtotal and total

2. Click "Approve & Create Invoice"

#### 3C. Wait for Processing (30-60 seconds)
- "Creating invoices..." message should appear
- Watch browser console for any errors (F12 → Console tab)

#### 3D. Verify Success Page
1. Success page should show:
   - ✅ "Your membership renewal has been submitted!"
   - ✅ Two payment buttons: "Pay with Credit Card (Stripe)" and "View QuickBooks Invoice"
   - ✅ Thank you message

2. **DO NOT CLICK PAYMENT BUTTONS YET**

---

## Test 4: Verify QuickBooks Invoice Creation

**Purpose:** Ensure QB invoice was created correctly

### Steps:
1. Log into QuickBooks Online
2. Go to Sales → Invoices
3. Find the invoice you just created (should be at top, most recent)

**Verify Invoice Details:**
- ✅ Customer name matches organization
- ✅ Invoice has correct line items:
  - Membership fee line
  - Conference attendee lines (if individual mode)
  - Tax codes applied correctly
- ✅ Invoice total matches preview total
- ✅ Invoice is marked as UNPAID
- ✅ Online payment enabled (should see "Pay Online" button)

**Copy Invoice Number** - you'll need this for next test

---

## Test 5: Verify Customer Invoice Email

**Purpose:** Ensure customer receives QB invoice email

### Steps:
1. **Check YOUR EMAIL** (the email you used in the test form)
2. Should receive email from QuickBooks with:
   - Subject: Invoice from [Your Company Name]
   - Invoice attached or link to view/pay online
   - "Pay Online" button

**If email doesn't arrive within 5 minutes:**
- Check spam folder
- Verify email in QuickBooks invoice matches what you entered
- Check Vercel function logs for errors

---

## Test 6: Verify Bookkeeper Notification Email

**Purpose:** Ensure bookkeeper receives coding instructions

### Steps:
1. **Check BOOKKEEPER_EMAIL** inbox
2. Should receive email with:
   - Subject: `[Bookkeeper] QB Invoice [number] - [CODING REQUIRED or Info Only] - [Org Name]`
   - Invoice number matches QB invoice
   - Contains coding breakdown with account numbers
   - Lists conference attendees if any

**For "Individual line items" mode:**
- Should say "✓ NO CODING REQUIRED - LINE ITEMS SEPARATED"
- Should list all line items with accounts

**For "Single item" mode:**
- Should say "⚠️ CODING REQUIRED"
- Should show journal entry instructions

---

## Test 7: Verify Notion Database Update

**Purpose:** Ensure data synced to Notion

### Steps:
1. Open Notion Organizations database
2. Find the organization you just tested
3. Verify fields are populated:
   - ✅ QB Invoice ID
   - ✅ QB Invoice Number
   - ✅ Stripe Session ID (should be populated)
   - ✅ Status updated
   - ✅ Contact information filled
   - ✅ Address populated

---

## Test 8: Test Stripe Payment (OPTIONAL BUT RECOMMENDED)

**Purpose:** Verify Stripe checkout works and payment processes correctly

### Steps:
1. Go back to success page (or click "Pay with Credit Card" button)
2. Should redirect to Stripe Checkout
3. Verify checkout page shows:
   - ✅ Correct line items
   - ✅ Correct total (tax-inclusive)
   - ✅ Customer email pre-filled
   - ✅ Address pre-filled

4. **Use Stripe Test Card:**
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., 12/25)
   - CVC: Any 3 digits (e.g., 123)
   - Name: Test Name
   - ZIP: Any valid ZIP

5. Complete payment

6. Should redirect to success page

7. **Verify Payment in Stripe Dashboard:**
   - Go to: https://dashboard.stripe.com/payments
   - Find the payment you just made
   - Status should be "Succeeded"
   - Amount should match invoice total

8. **Verify QuickBooks Invoice Updated:**
   - Go back to QB invoice
   - Should now be marked as PAID
   - Payment should be recorded

9. **Verify Notion Updated:**
   - Check Notion organization page
   - Stripe Payment ID should be populated
   - Payment status updated

---

## Test 9: Test Error Notification (Notion Sync Failure)

**Purpose:** Verify error emails work if Notion fails

### Steps:
1. Temporarily break Notion sync:
   - Go to Vercel environment variables
   - Change `NOTION_API_KEY` to invalid value (add "INVALID_" prefix)
   - Wait 1 minute for deployment

2. Submit another test form (quick submission, minimal data)

3. **Should see error page** instead of success page

4. **Check ERROR_NOTIFICATION_EMAIL:**
   - Should receive email with subject: `[CSC Membership] Notion Sync Failed - Action Required`
   - Should contain error details and organization name
   - Should list troubleshooting steps

5. **Fix Notion:**
   - Go back to Vercel and restore correct `NOTION_API_KEY`
   - Wait 1 minute for deployment

---

## Final Verification Checklist

Before sending renewal emails to members, verify:

### System Health
- [ ] QuickBooks tokens are fresh (expires in ~1 hour)
- [ ] Resend email service is working (test email received)
- [ ] Vercel functions are deployed and running

### End-to-End Flow
- [ ] Form submission works without errors
- [ ] Invoice preview shows correct calculations
- [ ] QB invoice created successfully
- [ ] Customer receives QB invoice email
- [ ] Bookkeeper receives coding notification email
- [ ] Notion database updated correctly
- [ ] Stripe checkout works and processes payment
- [ ] Payment updates QB invoice to PAID
- [ ] Payment updates Notion with payment ID

### Error Handling
- [ ] Error notification email works
- [ ] Error page shows when Notion fails
- [ ] QuickBooks and Stripe still work even if Notion fails

### Email Routing (CRITICAL)
- [ ] Customer invoices go to **customer's actual email** (not google@campusstores.ca)
- [ ] Bookkeeper notifications go to **BOOKKEEPER_EMAIL**
- [ ] Error alerts go to **ERROR_NOTIFICATION_EMAIL**
- [ ] Sender email is **RESEND_SENDER_EMAIL** (verified domain)

---

## If Any Test Fails

### QuickBooks Issues
1. Check: `/api/diagnose-qb` for diagnostic info
2. Re-authenticate if needed: `/qbo-oauth-helper.html`
3. Verify `QBO_BASE_URL` is production (not sandbox)
4. Check Vercel function logs for errors

### Email Issues
1. Check Resend logs: https://resend.com/logs
2. Verify all email env vars set in Vercel
3. Check spam folders
4. Verify Resend domain is verified

### Stripe Issues
1. Check Stripe dashboard logs
2. Verify using **live keys** (not test keys)
3. Verify webhook configured correctly
4. Check Vercel function logs

### Notion Issues
1. Verify `NOTION_API_KEY` is correct
2. Check Notion integration has database access
3. Verify database IDs are correct
4. Check Vercel function logs for sync errors

---

## Test Timing Recommendation

**Allow 30-45 minutes for complete test sequence**

1. Tests 1-2: 5 minutes (quick checks)
2. Test 3-7: 20-30 minutes (end-to-end flow)
3. Test 8: 10 minutes (Stripe payment)
4. Test 9: 5 minutes (error handling)

---

## After All Tests Pass

1. **Document results** (optional but recommended):
   - QB Invoice number created
   - Stripe payment ID
   - All emails received successfully

2. **Clean up test data:**
   - Delete test invoice from QuickBooks (or mark as void)
   - Delete test organization from Notion
   - Cancel/refund test Stripe payment if using real payment

3. **Double-check Vercel env vars one more time:**
   - All four email variables set correctly
   - No "INVALID_" prefixes left from testing
   - Using production QB credentials
   - Using live Stripe keys

4. **Send a test to yourself first:**
   - Before sending to all members, send renewal email to yourself
   - Go through the flow as a real user would
   - Make sure everything feels right

5. **GO LIVE! 🚀**

---

**Last Updated:** November 4, 2025, 11:00 PM
**Next Step:** Run this test plan tomorrow morning, then ship it!
