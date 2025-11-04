# Environment Variables Reference

Complete list of all environment variables required for the CSC Membership Renewal System.

## QuickBooks Online (QBO) Configuration

### Required for Production
```bash
QBO_CLIENT_ID=<your_qbo_client_id>
QBO_CLIENT_SECRET=<your_qbo_client_secret>
QBO_ACCESS_TOKEN=<current_access_token>
QBO_REFRESH_TOKEN=<current_refresh_token>
QBO_COMPANY_ID=<your_production_company_realm_id>
QBO_BASE_URL=https://quickbooks.api.intuit.com
```

**Notes:**
- `QBO_BASE_URL` for **sandbox**: `https://sandbox-quickbooks.api.intuit.com`
- `QBO_BASE_URL` for **production**: `https://quickbooks.api.intuit.com`
- Access tokens expire in 1 hour (auto-refreshed by cron job)
- Refresh tokens expire in ~101 days (requires manual re-authorization)

## Notion Configuration

### Required
```bash
NOTION_TOKEN=<your_notion_integration_token>
NOTION_ORGANIZATIONS_DB_ID=<organizations_database_id>
NOTION_CONTACTS_DB_ID=<contacts_database_id>
NOTION_SUBMISSIONS_DB_ID=<vendor_submissions_database_id>
```

### Optional (has default)
```bash
NOTION_TAG_SYSTEM_DB_ID=1f9a69bf0cfd8034b919f51b7c4f2c67
```

**Notes:**
- Get Notion token from: https://www.notion.so/my-integrations
- Database IDs are the 32-character hex strings from database URLs

## AWS Configuration

### For S3 File Uploads
```bash
AWS_ACCESS_KEY_ID=<your_aws_access_key>
AWS_SECRET_ACCESS_KEY=<your_aws_secret_key>
S3_BUCKET_NAME=<your_s3_bucket_name>
S3_REGION=<aws_region>
```

### For Resend Email Service (Replaces AWS SES)
```bash
RESEND_API_KEY=<your_resend_api_key>
RESEND_SENDER_EMAIL=<verified_sender_email>
ERROR_NOTIFICATION_EMAIL=<admin_email_for_errors>
BOOKKEEPER_EMAIL=<bookkeeper_email_for_invoice_coding>
```

**Notes:**
- `RESEND_API_KEY` - Get from https://resend.com/api-keys (required)
- `RESEND_SENDER_EMAIL` - Sender email with verified domain (e.g., `noreply@campusstores.ca`)
- `ERROR_NOTIFICATION_EMAIL` - Defaults to `steve@campusstores.ca` if not set (receives Notion sync errors)
- `BOOKKEEPER_EMAIL` - Defaults to `ERROR_NOTIFICATION_EMAIL` if not set (receives QuickBooks invoice coding instructions)
- **No sandbox mode** - Just add your domain and verify it, then send to anyone!

### Setting up Resend:
1. Go to Resend: https://resend.com/
2. **Create account** (free tier: 100 emails/day, 3,000/month)
3. **Add your domain**: Domains → Add Domain → `campusstores.ca`
4. **Verify domain**: Add DNS records provided by Resend (takes ~5 min)
5. **Create API key**: API Keys → Create API Key → Copy key to `RESEND_API_KEY`
6. **Done!** No sandbox mode, no email verification needed - just works!

**Cost:** Free for 3,000 emails/month, then $20/month for 50,000 emails
**Why Resend:** Simpler than AWS SES, no sandbox mode, better developer experience

## Vercel Configuration (for Auto Token Refresh)

### Required for Automatic Token Updates
```bash
VERCEL_TOKEN=<your_vercel_api_token>
VERCEL_PROJECT_ID=<your_vercel_project_id>
```

**Notes:**
- Get Vercel token from: https://vercel.com/account/tokens
- Find Project ID in: Vercel Project Settings → General
- These are used by the cron job to update QBO tokens automatically

## Quick Setup Checklist

### Minimal Setup (Core Functionality)
- [ ] All QuickBooks Online variables (6 variables)
- [ ] All Notion variables (4 variables)
- [ ] AWS S3 variables (4 variables)

### Full Production Setup (Recommended)
- [ ] All minimal setup variables
- [ ] Resend email variables (4 variables: RESEND_API_KEY, RESEND_SENDER_EMAIL, ERROR_NOTIFICATION_EMAIL, BOOKKEEPER_EMAIL)
- [ ] Vercel auto-refresh variables (2 variables)

### Optional (Already Has Defaults)
- [ ] `NOTION_TAG_SYSTEM_DB_ID` (only if using different tag database)

## Environment-Specific Configurations

### Sandbox/Development
```bash
QBO_BASE_URL=https://sandbox-quickbooks.api.intuit.com
QBO_COMPANY_ID=<sandbox_realm_id>
# Use sandbox tokens
```

### Production
```bash
QBO_BASE_URL=https://quickbooks.api.intuit.com
QBO_COMPANY_ID=<production_realm_id>
# Use production tokens
```

## Testing Your Configuration

### Test QuickBooks Connection
```bash
curl https://your-app.vercel.app/api/create-qbo-invoice \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Test Resend Email
```bash
curl https://your-app.vercel.app/api/send-error-notification \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"error": "Test error", "details": "Testing Resend integration", "organizationName": "Test Org", "timestamp": "2025-11-04T12:00:00Z"}'
```

Check your `ERROR_NOTIFICATION_EMAIL` inbox for the test email.

## Troubleshooting

### QuickBooks 401 Errors
- Check `QBO_ACCESS_TOKEN` is current
- Verify `QBO_REFRESH_TOKEN` hasn't expired (>101 days old)
- Re-run OAuth flow to get new tokens

### Resend Errors: "Domain not verified" or "Invalid from address"
- Add and verify your domain in Resend dashboard
- Make sure DNS records are added correctly
- Wait ~5 minutes for DNS propagation
- Sender email must be from verified domain (e.g., `noreply@campusstores.ca`)

### Notion 401 Errors
- Check `NOTION_TOKEN` is valid
- Verify integration has access to all databases
- Ensure database IDs are correct (32 hex characters)

### Cron Job Not Running
- Check Vercel cron is enabled: `api/vercel.json`
- Verify `VERCEL_TOKEN` has correct permissions
- Check Vercel function logs for errors

---

**Last Updated:** October 22, 2025
**Total Variables:** 19 (14 required, 3 for full features, 2 optional)
