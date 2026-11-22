import tls from 'tls';
import net from 'net';
import dotenv from 'dotenv';
dotenv.config();

const hostsToTest = [
  process.env.SMTP_HOST,
  'smtp.titan.email',
  'smtp.hostinger.com',
  'mail.thepperfumestory.com',
].filter(Boolean) as string[];

const port = parseInt(process.env.SMTP_PORT || '465', 10);
const user = process.env.SMTP_USER_CONTACT || 'contact@thepperfumestory.com';
const pass = process.env.SMTP_PASS || '';

console.log('Testing SMTP connection with settings:');
console.log('User:', user);
console.log('Pass length:', pass.length);
console.log('Port:', port);

async function testHost(host: string): Promise<void> {
  console.log(`\n--- Testing Host: ${host}:${port} ---`);
  return new Promise((resolve) => {
    let socket: tls.TLSSocket;
    try {
      socket = tls.connect(
        {
          host,
          port,
          rejectUnauthorized: false,
          timeout: 6000,
        },
        () => {
          console.log(`✓ Connected to ${host}:${port} via TLS!`);
        }
      );

      socket.on('data', (data) => {
        const text = data.toString().trim();
        console.log(`[${host} Response]:`, text);
        if (text.startsWith('220')) {
          console.log('Sending EHLO...');
          socket.write(`EHLO thepperfumestory.com\r\n`);
        } else if (text.includes('250') && !text.includes('AUTH LOGIN')) {
          console.log('Sending AUTH LOGIN...');
          socket.write('AUTH LOGIN\r\n');
        } else if (text.startsWith('334')) {
          console.log('Received auth challenge 334');
          socket.destroy();
          resolve();
        }
      });

      socket.on('error', (err) => {
        console.log(`✗ Error on ${host}:`, err.message);
        resolve();
      });

      socket.on('timeout', () => {
        console.log(`✗ Timeout on ${host}`);
        socket.destroy();
        resolve();
      });
    } catch (e: any) {
      console.log(`✗ Exception on ${host}:`, e.message);
      resolve();
    }
  });
}

async function run() {
  for (const h of hostsToTest) {
    await testHost(h);
  }
  process.exit(0);
}

run();
