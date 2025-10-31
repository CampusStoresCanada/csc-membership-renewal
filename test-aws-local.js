// Quick local test of AWS credentials
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const accessKeyId = process.argv[2];
const secretAccessKey = process.argv[3];
const region = 'us-east-1';
const from = 'noreply@campusstores.ca';
const to = 'steve@campusstores.ca';

if (!accessKeyId || !secretAccessKey) {
  console.error('Usage: node test-aws-local.js <ACCESS_KEY_ID> <SECRET_ACCESS_KEY>');
  process.exit(1);
}

console.log('Testing AWS SES credentials...');
console.log('Region:', region);
console.log('From:', from);
console.log('To:', to);
console.log('Access Key:', accessKeyId.substring(0, 10) + '...');

const client = new SESClient({
  region,
  credentials: { accessKeyId, secretAccessKey }
});

const command = new SendEmailCommand({
  Source: from,
  Destination: { ToAddresses: [to] },
  Message: {
    Subject: { Data: 'TEST - AWS SES Credentials', Charset: 'UTF-8' },
    Body: {
      Text: { Data: 'If you got this, AWS credentials work!', Charset: 'UTF-8' }
    }
  }
});

try {
  const response = await client.send(command);
  console.log('✅ SUCCESS! Message ID:', response.MessageId);
  console.log('AWS credentials are valid and SES is working.');
} catch (error) {
  console.error('❌ FAILED:', error.message);
  console.error('Error name:', error.name);
  if (error.name === 'MessageRejected') {
    console.error('\n🔍 Email not verified in SES. Go verify:', from);
  }
}
