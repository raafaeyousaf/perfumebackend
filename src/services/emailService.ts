import tls from 'tls';
import net from 'net';

export interface SendMailOptions {
  from: string;
  senderEmail: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  authEmail: string;
  authPassword?: string;
}

function sanitizeSecret(val?: string): string {
  if (!val) return '';
  return val
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n]/g, '')
    .trim();
}

const DEFAULT_SMTP_HOST = sanitizeSecret(process.env.SMTP_HOST) || 'smtp.hostinger.com';
const DEFAULT_SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const DEFAULT_MAILBOX_PASS = sanitizeSecret(process.env.SMTP_PASS) || 'Raafae@2004';

export const CONTACT_EMAIL = sanitizeSecret(process.env.SMTP_USER_CONTACT) || 'contact@thepperfumestory.com';
export const SALES_EMAIL = sanitizeSecret(process.env.SMTP_USER_SALES) || 'sales@thepperfumestory.com';

/**
 * Single-Host SMTP SMTPS (Port 465) / STARTTLS Sender with Multiline RFC 5321 parser
 */
async function attemptSmtpSend(
  host: string,
  port: number,
  options: SendMailOptions,
  password: string
): Promise<boolean> {
  return new Promise((resolve) => {
    let socket: tls.TLSSocket | net.Socket;
    let step = 0;
    let isFinished = false;
    let buffer = '';

    const finish = (success: boolean, reason?: string) => {
      if (isFinished) return;
      isFinished = true;
      if (!success && reason) {
        console.warn(`[SMTP Diagnostic] Host ${host}:${port} -> ${reason}`);
      }
      try {
        socket.destroy();
      } catch { }
      resolve(success);
    };

    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@thepperfumestory.com>`;

    const mimeMessage = [
      `From: ${options.from}`,
      `To: <${options.to}>`,
      `Reply-To: ${options.from}`,
      `Return-Path: <${options.senderEmail}>`,
      `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`,
      `X-Mailer: ThePerfumeStory Luxury Atelier`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(options.text).toString('base64'),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(options.html).toString('base64'),
      ``,
      `--${boundary}--`,
      ``,
      `.`,
    ].join('\r\n');

    const handleSmtpChunk = (data: Buffer) => {
      buffer += data.toString('utf8');

      // Check for full line
      if (!buffer.includes('\r\n')) return;

      const lines = buffer.split('\r\n').filter((l) => l.trim().length > 0);
      if (lines.length === 0) return;

      const lastLine = lines[lines.length - 1];

      // RFC 5321 multiline reply rule: if char at index 3 is '-', more lines follow!
      if (lastLine.length >= 4 && lastLine.charAt(3) === '-') {
        return; // wait for final line with space
      }

      buffer = '';
      const code = parseInt(lastLine.substring(0, 3), 10);

      // Step 0: Server Greeting (220)
      if (step === 0 && code === 220) {
        step = 1;
        socket.write(`EHLO thepperfumestory.com\r\n`);
        return;
      }

      // Step 1: EHLO response (250)
      if (step === 1 && code === 250) {
        step = 2;
        socket.write(`AUTH LOGIN\r\n`);
        return;
      }

      // Step 2: Username challenge (334)
      if (step === 2 && code === 334) {
        step = 3;
        socket.write(`${Buffer.from(options.authEmail).toString('base64')}\r\n`);
        return;
      }

      // Step 3: Password challenge (334)
      if (step === 3 && code === 334) {
        step = 4;
        socket.write(`${Buffer.from(password).toString('base64')}\r\n`);
        return;
      }

      // Step 4: Authentication Succeeded (235)
      if (step === 4 && code === 235) {
        step = 5;
        socket.write(`MAIL FROM:<${options.senderEmail}>\r\n`);
        return;
      }

      // Step 5: Sender Accepted (250)
      if (step === 5 && code === 250) {
        step = 6;
        socket.write(`RCPT TO:<${options.to}>\r\n`);
        return;
      }

      // Step 6: Recipient Accepted (250)
      if (step === 6 && code === 250) {
        step = 7;
        socket.write(`DATA\r\n`);
        return;
      }

      // Step 7: Ready for DATA (354)
      if (step === 7 && code === 354) {
        step = 8;
        socket.write(`${mimeMessage}\r\n`);
        return;
      }

      // Step 8: Message Accepted (250)
      if (step === 8 && code === 250) {
        step = 9;
        socket.write(`QUIT\r\n`);
        finish(true);
        return;
      }

      if (code >= 400) {
        finish(false, `SMTP code ${code}: ${lastLine}`);
      }
    };

    try {
      if (port === 465) {
        socket = tls.connect(
          {
            host,
            port,
            rejectUnauthorized: false,
            timeout: 6000,
          },
          () => {
            // Connected TLS
          }
        );
      } else {
        socket = net.connect({ host, port, timeout: 6000 });
      }

      socket.on('data', handleSmtpChunk);
      socket.on('error', (err) => finish(false, err.message));
      socket.on('timeout', () => finish(false, 'Connection timeout (6s)'));
    } catch (err: any) {
      finish(false, err.message);
    }
  });
}

/**
 * Robust Raw SMTPS Sender with Automatic Multi-Host Failover
 */
export async function sendEmailRaw(options: SendMailOptions): Promise<boolean> {
  const primaryHost = sanitizeSecret(process.env.SMTP_HOST) || DEFAULT_SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || String(DEFAULT_SMTP_PORT), 10);
  const rawPass =
    options.authPassword ||
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.MAIL_PASS ||
    process.env.MAIL_PASSWORD ||
    DEFAULT_MAILBOX_PASS ||
    'Raafae@2004';
  const password = sanitizeSecret(rawPass) || 'Raafae@2004';

  console.log(`[SMTP Attempt] Initiating delivery to ${options.to} via Auth "${options.authEmail}" (Pass length: ${password.length})`);

  // Candidate hosts: Hostinger native primary (verified by DNS MX records), then primaryHost, then Titan
  const candidateHosts = Array.from(
    new Set(['smtp.hostinger.com', primaryHost, 'smtp.titan.email'])
  ).filter(Boolean) as string[];

  // 1. First attempt with requested authEmail (e.g. sales@thepperfumestory.com)
  for (const host of candidateHosts) {
    try {
      const ok = await attemptSmtpSend(host, port, options, password);
      if (ok) {
        console.log(`✓ [SMTP Success] Delivered email to ${options.to} via ${host}:${port}!`);
        return true;
      }
    } catch { }
  }

  // 2. If requested authEmail failed (e.g. sales@ is not yet created on Hostinger or has different pass),
  // automatically fallback to the verified working CONTACT_EMAIL (contact@thepperfumestory.com)
  if (options.authEmail !== CONTACT_EMAIL) {
    console.log(`[SMTP Fallback] Retrying delivery to ${options.to} via verified mailbox "${CONTACT_EMAIL}"...`);
    const fallbackOptions: SendMailOptions = {
      ...options,
      from: `"The Perfume Story Dispatch" <${CONTACT_EMAIL}>`,
      senderEmail: CONTACT_EMAIL,
      authEmail: CONTACT_EMAIL,
    };
    for (const host of candidateHosts) {
      try {
        const ok = await attemptSmtpSend(host, port, fallbackOptions, password);
        if (ok) {
          console.log(`✓ [SMTP Success via Contact Fallback] Delivered email to ${options.to} via ${host}:${port}!`);
          return true;
        }
      } catch { }
    }
  }

  console.warn(`[SMTP Fallback] Outbound SMTP connection blocked or offline on local network. Logging email.`);
  return false;
}

/**
 * 1. Send Security Verification OTP Email
 * Sender: contact@thepperfumestory.com
 */
export async function sendOtpEmail(toEmail: string, otpCode: string, purpose: string = 'sign-in'): Promise<boolean> {
  const subject = `Your Security Verification Code: ${otpCode} | The Perfume Story`;

  // Always log prominently to terminal for local developer testing
  console.log(`
================================================================================
💎 [THE PERFUME STORY SECURITY OTP CODE]
   Recipient:     ${toEmail}
   Security Code: >>> ${otpCode} <<<
   Sender:        ${CONTACT_EMAIL}
   Valid For:     10 Minutes
================================================================================
`);

  const plainText = `THE PERFUME STORY - EXTRAIT DE PARFUM
Your Security Verification Code is: ${otpCode}

This one-time passcode is valid for 10 minutes.
Use it to complete your ${purpose === 'register' ? 'account registration' : 'sign in'} at The Perfume Story.

For scent concierge support, message our VIP WhatsApp at +92 343 5670660.
Lahore, Pakistan | contact@thepperfumestory.com`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f6f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #222222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f6f3; padding: 40px 12px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border: 1px solid #e5dfd5; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          <!-- Brand Header -->
          <tr>
            <td align="center" style="background-color: #0d0d0d; padding: 36px 24px 30px; text-align: center;">
              <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: bold; letter-spacing: 0.28em; color: #ffffff; text-transform: uppercase;">
                THE PERFUME STORY
              </div>
              <div style="font-size: 10px; letter-spacing: 0.35em; color: #c5a880; text-transform: uppercase; margin-top: 6px;">
                EXTRAIT DE PARFUM • ARTISANAL ATELIER
              </div>
            </td>
          </tr>

          <!-- Gold Accent Bar -->
          <tr>
            <td style="background-color: #b38e5d; height: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px 28px;">
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: normal; color: #111111; margin: 0 0 14px 0; text-align: center;">
                Security Verification Passcode
              </h1>
              <p style="font-size: 14px; line-height: 1.6; color: #555555; text-align: center; margin: 0 0 24px 0;">
                Please enter the following one-time code to authenticate your request on <strong>The Perfume Story</strong>:
              </p>

              <!-- OTP Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #faf7f2; border: 1.5px dashed #c5a880; border-radius: 6px; padding: 18px 36px; text-align: center;">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: bold; letter-spacing: 0.3em; color: #111111;">
                        ${otpCode}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="font-size: 12.5px; line-height: 1.6; color: #777777; text-align: center; margin: 0 0 10px 0;">
                ⏱️ This code will expire in <strong>10 minutes</strong>.
              </p>
              <p style="font-size: 12px; line-height: 1.5; color: #999999; text-align: center; margin: 0;">
                If you did not initiate this request, you can safely disregard this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #faf9f7; border-top: 1px solid #eee7dc; padding: 22px 28px; text-align: center;">
              <div style="font-size: 12px; color: #666666; margin-bottom: 6px;">
                VIP WhatsApp Scent Concierge: <a href="https://wa.me/923435670660" style="color: #111111; font-weight: bold; text-decoration: none;">+92 343 5670660</a>
              </div>
              <div style="font-size: 11px; color: #999999;">
                The Perfume Story Atelier • Lahore, Pakistan • <a href="mailto:contact@thepperfumestory.com" style="color: #999999;">contact@thepperfumestory.com</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmailRaw({
    from: `"The Perfume Story Concierge" <${CONTACT_EMAIL}>`,
    senderEmail: CONTACT_EMAIL,
    to: toEmail,
    subject,
    text: plainText,
    html,
    authEmail: CONTACT_EMAIL,
  });
}

/**
 * 2. Send Order Confirmation Email
 * Sender: sales@thepperfumestory.com
 */
export async function sendOrderConfirmationEmail(order: any): Promise<boolean> {
  const items = Array.isArray(order.items)
    ? order.items
    : typeof order.items === 'string'
      ? JSON.parse(order.items)
      : [];

  const subject = `Order Confirmed: #${order.order_number} | The Perfume Story Extrait De Parfum`;

  const itemsText = items
    .map((item: any) => `- ${item.name} (${item.size || '55 ml'}) x ${item.quantity || 1} = PKR ${Number(item.price) * (item.quantity || 1)}`)
    .join('\n');

  console.log(`✓ [Order Confirmation Ready] #${order.order_number} for ${order.customer_email}`);

  const plainText = `THE PERFUME STORY - ORDER CONFIRMATION
Order Number: #${order.order_number}
Customer: ${order.customer_name}
Delivery Address: ${order.shipping_address}, ${order.city}
Phone: ${order.customer_phone}

Items Ordered:
${itemsText}

Subtotal: PKR ${order.subtotal}
Shipping Fee: PKR ${order.shipping_fee}
Total Amount: PKR ${order.total_amount}
Payment Method: ${order.payment_method === 'bank_transfer' ? 'EasyPaisa / Bank Transfer (Husnain Siddique - 0343 5670660)' : 'Cash On Delivery'}

Track your order anytime: https://thepperfumestory.com/track-order?number=${order.order_number}
WhatsApp Concierge: +92 343 5670660
sales@thepperfumestory.com`;

  const itemsHtml = items
    .map(
      (item: any) => `
      <tr>
        <td style="padding: 12px 10px; border-bottom: 1px solid #f0ebe2; font-size: 13px; color: #222;">
          <strong>${item.name}</strong>
          <div style="font-size: 11.5px; color: #777;">Extrait De Parfum • ${item.size || '55 ml'}</div>
        </td>
        <td align="center" style="padding: 12px 10px; border-bottom: 1px solid #f0ebe2; font-size: 13px; color: #555;">
          ${item.quantity || 1}
        </td>
        <td align="right" style="padding: 12px 10px; border-bottom: 1px solid #f0ebe2; font-size: 13px; font-weight: bold; color: #111;">
          Rs. ${(Number(item.price) * (item.quantity || 1)).toLocaleString()}
        </td>
      </tr>
    `
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f6f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #222222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f6f3; padding: 40px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e5dfd5; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #0d0d0d; padding: 36px 24px 30px; text-align: center;">
              <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: bold; letter-spacing: 0.28em; color: #ffffff; text-transform: uppercase;">
                THE PERFUME STORY
              </div>
              <div style="font-size: 10px; letter-spacing: 0.35em; color: #c5a880; text-transform: uppercase; margin-top: 6px;">
                EXTRAIT DE PARFUM • CONSIGNMENT CONFIRMATION
              </div>
            </td>
          </tr>
          <tr><td style="background-color: #b38e5d; height: 3px;"></td></tr>

          <!-- Notification Banner -->
          <tr>
            <td style="padding: 32px 32px 16px;">
              <div style="font-size: 11px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; color: #b38e5d; margin-bottom: 6px;">
                ORDER CONFIRMED
              </div>
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: normal; color: #111111; margin: 0 0 14px 0;">
                Dear ${order.customer_name},
              </h1>
              <p style="font-size: 13.5px; line-height: 1.6; color: #444444; margin: 0 0 20px 0;">
                Thank you for acquiring artisanal creations from <strong>The Perfume Story</strong>. Your order <strong>#${order.order_number}</strong> is confirmed and our master perfumers are packaging your flacons for express nationwide dispatch.
              </p>

              <!-- Order Summary Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #faf9f7; border: 1px solid #ede6db; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.08em; margin-bottom: 4px;">Destination & Contact</div>
                    <div style="font-size: 13.5px; font-weight: bold; color: #111; margin-bottom: 2px;">${order.shipping_address}, ${order.city}</div>
                    <div style="font-size: 12.5px; color: #555;">Recipient Phone: ${order.customer_phone}</div>
                  </td>
                </tr>
              </table>

              <!-- Items Table -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                <thead>
                  <tr style="background-color: #f7f5f1;">
                    <th align="left" style="padding: 10px; font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.08em;">Fragrance</th>
                    <th align="center" style="padding: 10px; font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.08em;">Qty</th>
                    <th align="right" style="padding: 10px; font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.08em;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Total Breakdown -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="right" style="font-size: 13px; color: #666; padding: 4px 10px;">Subtotal:</td>
                  <td align="right" width="100" style="font-size: 13px; color: #222; padding: 4px 10px;">Rs. ${Number(order.subtotal).toLocaleString()}</td>
                </tr>
                <tr>
                  <td align="right" style="font-size: 13px; color: #666; padding: 4px 10px;">Express Shipping:</td>
                  <td align="right" style="font-size: 13px; color: ${order.shipping_fee == 0 ? '#15803d' : '#222'}; padding: 4px 10px;">
                    ${order.shipping_fee == 0 ? 'FREE' : `Rs. ${Number(order.shipping_fee).toLocaleString()}`}
                  </td>
                </tr>
                <tr>
                  <td align="right" style="font-size: 15px; font-weight: bold; color: #111; padding: 8px 10px; border-top: 2px solid #111;">Grand Total:</td>
                  <td align="right" style="font-size: 16px; font-weight: bold; color: #b38e5d; padding: 8px 10px; border-top: 2px solid #111;">
                    Rs. ${Number(order.total_amount).toLocaleString()}
                  </td>
                </tr>
              </table>

              <!-- Action Link -->
              <div style="text-align: center; margin-bottom: 12px;">
                <a href="https://thepperfumestory.com/track-order?number=${order.order_number}" style="display: inline-block; background-color: #0d0d0d; color: #ffffff; text-decoration: none; padding: 14px 28px; font-size: 12px; font-weight: bold; letter-spacing: 0.12em; text-transform: uppercase; border-radius: 2px;">
                  Track Live Shipment &rarr;
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #faf9f7; border-top: 1px solid #eee7dc; padding: 22px 28px; text-align: center;">
              <div style="font-size: 12px; color: #666666; margin-bottom: 6px;">
                WhatsApp Helpline: <a href="https://wa.me/923435670660" style="color: #111111; font-weight: bold; text-decoration: none;">+92 343 5670660</a>
              </div>
              <div style="font-size: 11px; color: #999999;">
                The Perfume Story • Artisanal Extraits • <a href="mailto:sales@thepperfumestory.com" style="color: #999999;">sales@thepperfumestory.com</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmailRaw({
    from: `"The Perfume Story Sales" <${SALES_EMAIL}>`,
    senderEmail: SALES_EMAIL,
    to: order.customer_email,
    subject,
    text: plainText,
    html,
    authEmail: SALES_EMAIL,
  });
}

/**
 * 3. Send Official Itemized Order Receipt & Tax Invoice Email
 * Sender: sales@thepperfumestory.com
 */
export async function sendOrderReceiptEmail(order: any): Promise<boolean> {
  const items = Array.isArray(order.items)
    ? order.items
    : typeof order.items === 'string'
      ? JSON.parse(order.items)
      : [];

  const subject = `Official Tax Invoice & Receipt: #${order.order_number} | The Perfume Story`;
  const isBank = order.payment_method === 'bank_transfer';

  console.log(`✓ [Official Tax Invoice Ready] #${order.order_number} for ${order.customer_email}`);

  const plainText = `THE PERFUME STORY - OFFICIAL TAX INVOICE & RECEIPT
Invoice Ref: INV-${order.order_number}
Date: ${new Date().toLocaleDateString('en-PK')}
Billed To: ${order.customer_name} (${order.customer_email})
Delivery City: ${order.city}
Grand Total Amount: PKR ${order.total_amount}

${isBank ? 'EASYPAISA PAYMENT INSTRUCTIONS:\nPlease transfer PKR ' + order.total_amount + ' to EasyPaisa: 0343 5670660 (Account Title: Husnain Siddique).\nShare transaction receipt screenshot on WhatsApp to +92 343 5670660.' : 'PAYMENT: Cash on Delivery upon shipment handover.'}

Print or View Receipt: https://thepperfumestory.com/orders/receipt/${order.order_number}
WhatsApp Helpline: +92 343 5670660 | sales@thepperfumestory.com`;

  const itemsHtml = items
    .map(
      (item: any) => `
      <tr>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e8e3d9; font-size: 13px; color: #111;">
          <strong>${item.name}</strong>
          <div style="font-size: 11px; color: #777;">Extrait De Parfum (${item.size || '55 ml'})</div>
        </td>
        <td align="center" style="padding: 12px 10px; border-bottom: 1px solid #e8e3d9; font-size: 13px; color: #444;">
          ${item.quantity || 1}
        </td>
        <td align="right" style="padding: 12px 10px; border-bottom: 1px solid #e8e3d9; font-size: 13px; color: #444;">
          Rs. ${Number(item.price).toLocaleString()}
        </td>
        <td align="right" style="padding: 12px 10px; border-bottom: 1px solid #e8e3d9; font-size: 13px; font-weight: bold; color: #111;">
          Rs. ${(Number(item.price) * (item.quantity || 1)).toLocaleString()}
        </td>
      </tr>
    `
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f6f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #222222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f6f3; padding: 40px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e5dfd5; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          <!-- Luxury Header -->
          <tr>
            <td style="background-color: #0d0d0d; padding: 32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left">
                    <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: bold; letter-spacing: 0.22em; color: #ffffff; text-transform: uppercase;">
                      THE PERFUME STORY
                    </div>
                    <div style="font-size: 9.5px; letter-spacing: 0.3em; color: #c5a880; text-transform: uppercase; margin-top: 4px;">
                      EXTRAIT DE PARFUM
                    </div>
                  </td>
                  <td align="right">
                    <div style="font-size: 11px; letter-spacing: 0.12em; color: #c5a880; text-transform: uppercase; font-weight: bold;">
                      OFFICIAL RECEIPT
                    </div>
                    <div style="font-size: 13px; color: #ffffff; font-weight: bold; margin-top: 2px;">
                      #${order.order_number}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="background-color: #b38e5d; height: 3px;"></td></tr>

          <!-- Invoice Details -->
          <tr>
            <td style="padding: 28px 28px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  <td width="50%" valign="top">
                    <div style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.08em; margin-bottom: 4px;">BILLED TO</div>
                    <div style="font-size: 14px; font-weight: bold; color: #111;">${order.customer_name}</div>
                    <div style="font-size: 12.5px; color: #555;">${order.customer_email}</div>
                    <div style="font-size: 12.5px; color: #555;">${order.customer_phone}</div>
                  </td>
                  <td width="50%" valign="top" align="right">
                    <div style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.08em; margin-bottom: 4px;">ORDER METADATA</div>
                    <div style="font-size: 12.5px; color: #444;">Date: <strong>${new Date().toLocaleDateString('en-PK')}</strong></div>
                    <div style="font-size: 12.5px; color: #444;">City: <strong>${order.city}</strong></div>
                    <div style="font-size: 12.5px; color: #444;">Payment: <strong>${isBank ? 'EasyPaisa / Bank' : 'Cash on Delivery'}</strong></div>
                  </td>
                </tr>
              </table>

              ${isBank
      ? `
              <!-- EasyPaisa Transfer Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffaf2; border: 1.5px solid #c5a880; border-radius: 5px; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <div style="font-size: 12px; font-weight: bold; color: #8a6d3b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
                      ⚠️ EasyPaisa / Bank Transfer Payment Required
                    </div>
                    <div style="font-size: 13px; color: #222; margin-bottom: 6px;">
                      Please transfer <strong>PKR ${Number(order.total_amount).toLocaleString()}</strong> to:
                    </div>
                    <div style="background-color: #ffffff; border: 1px dashed #b38e5d; padding: 10px 14px; border-radius: 4px; margin-bottom: 8px;">
                      <div style="font-size: 12px; color: #555;">Account Title: <strong>Husnain Siddique</strong></div>
                      <div style="font-size: 15px; font-weight: bold; color: #111;">📱 EasyPaisa: 0343 5670660 (+92 343 5670660)</div>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                      Transfer karne ke baad screenshot WhatsApp (<strong>+92 343 5670660</strong>) par send kar dein taake order foran dispatch ho.
                    </div>
                  </td>
                </tr>
              </table>
              `
      : ''
    }

              <!-- Receipt Items Table -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                <thead>
                  <tr style="background-color: #f7f5f1; border-top: 1px solid #e0d8cc; border-bottom: 1px solid #e0d8cc;">
                    <th align="left" style="padding: 10px; font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: 0.08em;">Description</th>
                    <th align="center" style="padding: 10px; font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: 0.08em;">Qty</th>
                    <th align="right" style="padding: 10px; font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: 0.08em;">Unit Price</th>
                    <th align="right" style="padding: 10px; font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: 0.08em;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Pricing Breakdown -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="right" style="font-size: 13px; color: #666; padding: 4px 10px;">Subtotal:</td>
                  <td align="right" width="110" style="font-size: 13px; color: #222; padding: 4px 10px;">Rs. ${Number(order.subtotal).toLocaleString()}</td>
                </tr>
                <tr>
                  <td align="right" style="font-size: 13px; color: #666; padding: 4px 10px;">Shipping:</td>
                  <td align="right" style="font-size: 13px; color: ${order.shipping_fee == 0 ? '#15803d' : '#222'}; padding: 4px 10px;">
                    ${order.shipping_fee == 0 ? 'FREE' : `Rs. ${Number(order.shipping_fee).toLocaleString()}`}
                  </td>
                </tr>
                <tr>
                  <td align="right" style="font-size: 15px; font-weight: bold; color: #111; padding: 8px 10px; border-top: 2px solid #111;">Amount Due:</td>
                  <td align="right" style="font-size: 16px; font-weight: bold; color: #b38e5d; padding: 8px 10px; border-top: 2px solid #111;">
                    Rs. ${Number(order.total_amount).toLocaleString()}
                  </td>
                </tr>
              </table>

              <!-- Printable Receipt Link -->
              <div style="text-align: center; margin-bottom: 12px;">
                <a href="https://thepperfumestory.com/orders/receipt/${order.order_number}" style="display: inline-block; background-color: #0d0d0d; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 11.5px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; border-radius: 2px;">
                  Open Printable Receipt &rarr;
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #faf9f7; border-top: 1px solid #eee7dc; padding: 20px 28px; text-align: center;">
              <div style="font-size: 11.5px; color: #666666; margin-bottom: 4px;">
                WhatsApp Billing Concierge: <a href="https://wa.me/923435670660" style="color: #111; font-weight: bold;">+92 343 5670660</a>
              </div>
              <div style="font-size: 11px; color: #999999;">
                The Perfume Story • All formulations macerated 60+ days • <a href="mailto:sales@thepperfumestory.com" style="color: #999999;">sales@thepperfumestory.com</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmailRaw({
    from: `"The Perfume Story Accounts" <${SALES_EMAIL}>`,
    senderEmail: SALES_EMAIL,
    to: order.customer_email,
    subject,
    text: plainText,
    html,
    authEmail: SALES_EMAIL,
  });
}

/**
 * 4. Send Cart Notification / Reservation Email
 * Sender: sales@thepperfumestory.com
 */
export async function sendCartNotificationEmail(toEmail: string, customerName: string, product: any, size: any, quantity: number): Promise<boolean> {
  const price = (Number(size?.price) || Number(product.price) || 2950) * quantity;
  const subject = `Your Selection Reserved: ${product.name} | The Perfume Story`;

  console.log(`✓ [Cart Reservation Ready] for ${toEmail} (${product.name})`);

  const plainText = `THE PERFUME STORY - CART RESERVATION
Dear ${customerName || 'Valued Client'},

You recently added ${product.name} (${size?.size || '55 ml'} x ${quantity}) to your shopping bag.
Total Amount: PKR ${price.toLocaleString()}

Complete your acquisition now: https://thepperfumestory.com/checkout
WhatsApp Concierge: +92 343 5670660`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin: 0; padding: 0; background-color: #f7f6f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f6f3; padding: 40px 12px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border: 1px solid #e5dfd5; border-radius: 6px; overflow: hidden;">
          <tr>
            <td align="center" style="background-color: #0d0d0d; padding: 32px 20px;">
              <div style="font-family: Georgia, serif; font-size: 19px; font-weight: bold; letter-spacing: 0.24em; color: #ffffff;">THE PERFUME STORY</div>
              <div style="font-size: 9.5px; letter-spacing: 0.3em; color: #c5a880; margin-top: 4px;">EXTRAIT DE PARFUM</div>
            </td>
          </tr>
          <tr><td style="background-color: #b38e5d; height: 3px;"></td></tr>
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="font-family: Georgia, serif; font-size: 18px; color: #111; margin: 0 0 12px 0;">
                Your Selection Has Been Reserved
              </h2>
              <p style="font-size: 13.5px; line-height: 1.6; color: #555; margin: 0 0 20px 0;">
                You added <strong>${product.name}</strong> (${size?.size || '55 ml'}, Qty: ${quantity}) to your bag. Flacons are produced in limited batches of 100 numbered bottles.
              </p>
              <div style="background-color: #faf8f5; border: 1px solid #eee4d5; padding: 16px; border-radius: 4px; margin-bottom: 24px; text-align: center;">
                <div style="font-size: 15px; font-weight: bold; color: #111;">${product.name}</div>
                <div style="font-size: 12px; color: #666; margin: 2px 0 6px 0;">${size?.size || '55 ml'} • Extrait De Parfum</div>
                <div style="font-size: 16px; font-weight: bold; color: #b38e5d;">Rs. ${price.toLocaleString()}</div>
              </div>
              <div style="text-align: center;">
                <a href="https://thepperfumestory.com/checkout" style="display: inline-block; background-color: #0d0d0d; color: #ffffff; text-decoration: none; padding: 13px 28px; font-size: 11.5px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase;">
                  Proceed to Secure Checkout &rarr;
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #faf9f7; border-top: 1px solid #eee7dc; padding: 18px 24px; text-align: center; font-size: 11.5px; color: #777;">
              VIP WhatsApp Support: <a href="https://wa.me/923435670660" style="color: #111; font-weight: bold;">+92 343 5670660</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmailRaw({
    from: `"The Perfume Story Atelier" <${SALES_EMAIL}>`,
    senderEmail: SALES_EMAIL,
    to: toEmail,
    subject,
    text: plainText,
    html,
    authEmail: SALES_EMAIL,
  });
}

/**
 * 5. Send Order Status Update Email (When Admin Changes Status)
 * Sender: sales@thepperfumestory.com
 */
export async function sendOrderStatusUpdateEmail(order: any, newStatus: string): Promise<boolean> {
  const normStatus = (newStatus || '').toLowerCase().trim();

  // Map status to customer-facing luxury details
  let statusBadge = 'STATUS UPDATED';
  let badgeColor = '#b38e5d';
  let badgeBg = '#fbf7f0';
  let badgeBorder = '#e8decb';
  let headline = `Order #${order.order_number} Update`;
  let statusMessage = `The status of your fragrance consignment has been updated to "${newStatus.toUpperCase()}".`;

  if (normStatus === 'confirmed') {
    statusBadge = 'ACCEPTED & CONFIRMED';
    badgeColor = '#16a34a';
    badgeBg = '#f0fdf4';
    badgeBorder = '#bbf7d0';
    headline = 'Your Order Has Been Accepted!';
    statusMessage = 'Great news! The atelier has reviewed and officially accepted your order. Your flacons are now queued for hand-bottling and batch verification.';
  } else if (normStatus === 'preparing') {
    statusBadge = 'ARTISANAL PACKAGING';
    badgeColor = '#d97706';
    badgeBg = '#fffbeb';
    badgeBorder = '#fde68a';
    headline = 'Your Consignment is Being Handcrafted';
    statusMessage = 'Our master perfumers are carefully bottling, packaging, and applying signature wax seals to your extrait de parfum flacons.';
  } else if (normStatus === 'shipped') {
    statusBadge = 'DISPATCHED & EN ROUTE';
    badgeColor = '#2563eb';
    badgeBg = '#eff6ff';
    badgeBorder = '#bfdbfe';
    headline = 'Your Order is on Its Way!';
    statusMessage = `Your fragrance consignment has been handed to our express courier partner and is on its way to ${order.city || 'your address'}. Estimated delivery is within 2 to 4 business days.`;
  } else if (normStatus === 'delivered') {
    statusBadge = 'SUCCESSFULLY DELIVERED';
    badgeColor = '#15803d';
    badgeBg = '#dcfce7';
    badgeBorder = '#86efac';
    headline = 'Your Parcel Has Been Delivered!';
    statusMessage = `Your consignment has been delivered to ${order.shipping_address}, ${order.city}. We hope you immerse in the rich projection and sillage of your new signature extrait.`;
  } else if (normStatus === 'rejected' || normStatus === 'cancelled') {
    statusBadge = 'ORDER CANCELLED';
    badgeColor = '#dc2626';
    badgeBg = '#fef2f2';
    badgeBorder = '#fecaca';
    headline = 'Important Update Regarding Your Order';
    statusMessage = `Your order #${order.order_number} has been cancelled. If you transferred funds via EasyPaisa or Bank, our accounts team will verify and initiate an immediate full refund.`;
  }

  const subject = `Order #${order.order_number} Status Update: ${statusBadge} | The Perfume Story`;

  const items = Array.isArray(order.items)
    ? order.items
    : typeof order.items === 'string'
      ? JSON.parse(order.items)
      : [];

  const itemsListText = items
    .map((i: any) => `- ${i.name} (${i.size || '55 ml'}) x ${i.quantity || 1}`)
    .join('\n');

  console.log(`✓ [Order Status Update Ready] #${order.order_number} (${statusBadge}) for ${order.customer_email}`);

  const plainText = `THE PERFUME STORY - ORDER STATUS UPDATE
Order Number: #${order.order_number}
Status: ${statusBadge}

Dear ${order.customer_name},
${statusMessage}

Items in Order:
${itemsListText}

Delivery Address: ${order.shipping_address}, ${order.city}
Total Order Value: PKR ${order.total_amount}

Live Order Tracking: https://thepperfumestory.com/track-order?number=${order.order_number}
Direct WhatsApp Support: +92 343 5670660
The Perfume Story Atelier • sales@thepperfumestory.com`;

  const itemsHtml = items
    .map(
      (item: any) => `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #f0ebe2; font-size: 13px; color: #222;">
          <strong>${item.name}</strong>
          <div style="font-size: 11px; color: #777;">Extrait De Parfum • ${item.size || '55 ml'}</div>
        </td>
        <td align="center" style="padding: 10px 8px; border-bottom: 1px solid #f0ebe2; font-size: 12.5px; color: #555;">
          ${item.quantity || 1}
        </td>
        <td align="right" style="padding: 10px 8px; border-bottom: 1px solid #f0ebe2; font-size: 13px; font-weight: bold; color: #111;">
          Rs. ${(Number(item.price) * (item.quantity || 1)).toLocaleString()}
        </td>
      </tr>
    `
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f6f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #222222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f6f3; padding: 40px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e5dfd5; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #0d0d0d; padding: 32px 24px 26px; text-align: center;">
              <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: bold; letter-spacing: 0.28em; color: #ffffff; text-transform: uppercase;">
                THE PERFUME STORY
              </div>
              <div style="font-size: 10px; letter-spacing: 0.35em; color: #c5a880; text-transform: uppercase; margin-top: 5px;">
                EXTRAIT DE PARFUM • CONSIGNMENT TRACKING
              </div>
            </td>
          </tr>
          <tr><td style="background-color: #b38e5d; height: 3px;"></td></tr>

          <!-- Status Highlight Card -->
          <tr>
            <td style="padding: 32px 32px 16px;">
              <div style="text-align: center; margin-bottom: 20px;">
                <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; border: 1.5px solid ${badgeBorder}; padding: 6px 18px; border-radius: 20px; font-size: 11px; font-weight: bold; letter-spacing: 0.12em; text-transform: uppercase;">
                  ${statusBadge}
                </span>
              </div>

              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 21px; font-weight: normal; color: #111111; margin: 0 0 12px 0; text-align: center;">
                ${headline}
              </h1>
              <p style="font-size: 14px; line-height: 1.6; color: #444444; margin: 0 0 24px 0; text-align: center;">
                Dear <strong>${order.customer_name}</strong>,<br/>
                ${statusMessage}
              </p>

              <!-- Order Snapshot Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #faf9f7; border: 1px solid #ede6db; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left">
                          <div style="font-size: 10.5px; text-transform: uppercase; color: #888; letter-spacing: 0.08em;">Order Tracking Ref</div>
                          <div style="font-size: 15px; font-weight: bold; color: #111;">#${order.order_number}</div>
                        </td>
                        <td align="right">
                          <div style="font-size: 10.5px; text-transform: uppercase; color: #888; letter-spacing: 0.08em;">Grand Total</div>
                          <div style="font-size: 15px; font-weight: bold; color: #b38e5d;">Rs. ${Number(order.total_amount).toLocaleString()}</div>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 10px; border-top: 1px dashed #e5dfd5; margin-top: 10px; font-size: 12px; color: #555;">
                          <strong>Delivery Address:</strong> ${order.shipping_address}, ${order.city}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Items in this Order -->
              <div style="font-size: 11.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #222; margin-bottom: 10px;">
                Consignment Items
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 28px;">
                <thead>
                  <tr style="background-color: #f6f3ee;">
                    <th align="left" style="padding: 8px; font-size: 11px; text-transform: uppercase; color: #666;">Fragrance</th>
                    <th align="center" style="padding: 8px; font-size: 11px; text-transform: uppercase; color: #666;">Qty</th>
                    <th align="right" style="padding: 8px; font-size: 11px; text-transform: uppercase; color: #666;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Action Button: Track Order Live -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  <td align="center">
                    <a href="https://thepperfumestory.com/track-order?number=${order.order_number}" style="display: inline-block; background-color: #0d0d0d; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 12px; font-weight: bold; letter-spacing: 0.12em; text-transform: uppercase; border-radius: 3px;">
                      Track Order Live &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #faf9f7; border-top: 1px solid #eee7dc; padding: 22px 28px; text-align: center;">
              <div style="font-size: 12px; color: #666666; margin-bottom: 6px;">
                Questions about your delivery? WhatsApp Concierge: <a href="https://wa.me/923435670660" style="color: #111111; font-weight: bold; text-decoration: none;">+92 343 5670660</a>
              </div>
              <div style="font-size: 11px; color: #999999;">
                The Perfume Story Atelier • Lahore, Pakistan • <a href="mailto:sales@thepperfumestory.com" style="color: #999999;">sales@thepperfumestory.com</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmailRaw({
    from: `"The Perfume Story Dispatch Desk" <${SALES_EMAIL}>`,
    senderEmail: SALES_EMAIL,
    to: order.customer_email,
    subject,
    text: plainText,
    html,
    authEmail: SALES_EMAIL,
  });
}


