import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendEmail(to, subject, html, text) {
  if (!transporter) {
    console.warn('SMTP not configured, skipping email send');
    return { success: false, skipped: true };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send failed:', error);
    return { success: false, error: error.message };
  }
}

export async function sendQuotaNotification(tenant, quotaType, level, currentUsage, limit) {
  const subject = `配额提醒 - ${tenant.name}`;
  const levelText = {
    80: '80%',
    90: '90%',
    95: '95%',
    100: '100%',
  }[level] || level;
  
  const typeText = {
    free: '免费额度',
    package: '套餐包含量',
    hard_limit: '硬限制',
  }[quotaType] || quotaType;

  const html = `
    <h3>配额使用提醒</h3>
    <p>尊敬的 ${tenant.name}：</p>
    <p>您的${typeText}使用量已达到 <strong>${levelText}</strong></p>
    <p>当前用量：${currentUsage}</p>
    <p>配额上限：${limit}</p>
    <p>请及时关注使用情况，避免影响您的业务。</p>
  `;

  return sendEmail(tenant.contactEmail, subject, html, subject);
}

export async function sendBillNotification(tenant, bill) {
  const subject = `账单通知 - ${tenant.name} ${bill.month}`;
  const html = `
    <h3>您的账单已生成</h3>
    <p>尊敬的 ${tenant.name}：</p>
    <p>${bill.month} 月份账单已生成</p>
    <p>账单编号：${bill.billNo}</p>
    <p>应付金额：<strong>¥${bill.totalAmount}</strong></p>
    <p>请登录管理平台查看详情。</p>
  `;

  return sendEmail(tenant.contactEmail, subject, html, subject);
}

export default {
  sendEmail,
  sendQuotaNotification,
  sendBillNotification,
};
