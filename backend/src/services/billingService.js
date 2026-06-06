import { billingQueue, emailQueue } from '../config/queue.js';
import {
  Bill, BillItem, Tenant, ApiInterface, Invoice,
  DeadLetterEvent, Notification, sequelize, Op,
} from '../models/index.js';
import { getMonthKey, getMonthStart, getMonthEnd } from '../utils/dateUtils.js';
import { getMonthlyUsage } from './usageAggregationService.js';
import { getActiveRules, calculateUsageCost } from './meteringRuleService.js';
import { sendBillNotification } from '../utils/emailService.js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const TAX_RATE = parseFloat(process.env.TAX_RATE || '0');

export async function generateBillsForMonth(month, operator = 'system') {
  const targetMonth = month || getMonthKey(new Date(Date.now() - 86400000));
  
  console.log(`Starting bill generation for ${targetMonth}`);
  
  const tenants = await Tenant.findAll({
    where: { status: 'active' },
    attributes: ['id', 'name', 'code', 'contactEmail', 'discountRate'],
  });

  const results = [];
  
  for (const tenant of tenants) {
    const generationId = `${targetMonth}:${tenant.id}`;
    
    const existingBill = await Bill.findOne({
      where: { generationId },
    });
    
    if (existingBill) {
      console.log(`Bill already exists for tenant ${tenant.code} in ${targetMonth}`);
      results.push({
        tenantId: tenant.id,
        tenantCode: tenant.code,
        billId: existingBill.id,
        status: 'existing',
      });
      continue;
    }

    await billingQueue.add({
      tenantId: tenant.id,
      month: targetMonth,
      generationId,
      operator,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    });

    results.push({
      tenantId: tenant.id,
      tenantCode: tenant.code,
      status: 'queued',
    });
  }

  console.log(`Queued ${results.length} bills for generation`);
  return results;
}

export async function processBillGeneration(job) {
  const { tenantId, month, generationId, operator } = job.data;
  
  const t = await sequelize.transaction();
  
  try {
    const tenant = await Tenant.findByPk(tenantId, { transaction: t });
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const existingBill = await Bill.findOne({
      where: { generationId },
      transaction: t,
    });
    
    if (existingBill) {
      return { billId: existingBill.id, status: 'existing' };
    }

    const hasDeadLetters = await DeadLetterEvent.count({
      where: {
        tenantId,
        month,
        status: { [Op.in]: ['pending', 'failed'] },
      },
      transaction: t,
    });

    const monthlyUsage = await getMonthlyUsage(tenantId, month);
    
    if (monthlyUsage.length === 0 && hasDeadLetters === 0) {
      const zeroBill = await Bill.create({
        billNo: await generateBillNo(month, t),
        tenantId,
        month,
        status: hasDeadLetters > 0 ? 'pending_confirm' : 'confirmed',
        isZeroBill: true,
        subtotalAmount: 0,
        freeDeduction: 0,
        packageDeduction: 0,
        discountAmount: 0,
        taxableAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        taxRate: TAX_RATE,
        discountRate: tenant.discountRate || 0,
        hasUnprocessedDeadLetters: hasDeadLetters > 0,
        generationId,
        confirmedAt: hasDeadLetters === 0 ? new Date() : null,
        confirmedBy: hasDeadLetters === 0 ? operator : null,
      }, { transaction: t });

      await t.commit();
      console.log(`Zero bill generated for tenant ${tenant.code} in ${month}`);
      
      await sendBillEmail(zeroBill.id);
      
      return { billId: zeroBill.id, status: 'zero_bill' };
    }

    let subtotalAmount = 0;
    let freeDeduction = 0;
    let packageDeduction = 0;
    const billItems = [];

    for (const usage of monthlyUsage) {
      const rules = await getActiveRules(usage.apiInterfaceId, month);
      
      for (const rule of rules) {
        let usageAmount;
        switch (rule.dimension) {
          case 'count':
            usageAmount = usage.callCount;
            break;
          case 'data_transfer':
            usageAmount = usage.dataTransferMB;
            break;
          case 'compute_time':
            usageAmount = usage.computeSeconds;
            break;
          default:
            continue;
        }

        if (usageAmount <= 0) continue;

        const costResult = calculateUsageCost(usageAmount, rule);
        
        const billItem = {
          apiInterfaceId: usage.apiInterfaceId,
          dimension: rule.dimension,
          usageAmount,
          unit: rule.unit,
          unitPrice: rule.pricingType === 'fixed' ? rule.unitPrice : rule.tiers[0]?.price || 0,
          pricingType: rule.pricingType,
          tierDetails: costResult.details,
          subtotal: costResult.totalPrice,
          freeDeduction: 0,
          packageDeduction: 0,
          finalAmount: costResult.totalPrice,
        };

        const { Quota } = await import('../models/index.js');
        const freeQuota = await Quota.findOne({
          where: {
            tenantId,
            apiInterfaceId: { [Op.or]: [usage.apiInterfaceId, null] },
            type: 'free',
            dimension: rule.dimension,
            month,
          },
          transaction: t,
        });

        if (freeQuota && usageAmount > 0) {
          const freeUsage = Math.min(usageAmount, parseFloat(freeQuota.limitAmount));
          const freeCost = calculateUsageCost(freeUsage, rule).totalPrice;
          billItem.freeDeduction = freeCost;
          billItem.finalAmount -= freeCost;
          freeDeduction += freeCost;
        }

        const packageQuota = await Quota.findOne({
          where: {
            tenantId,
            apiInterfaceId: { [Op.or]: [usage.apiInterfaceId, null] },
            type: 'package',
            dimension: rule.dimension,
            month,
          },
          transaction: t,
        });

        if (packageQuota && usageAmount > 0) {
          const packageUsage = Math.min(usageAmount, parseFloat(packageQuota.limitAmount));
          const packageCost = calculateUsageCost(packageUsage, rule).totalPrice;
          billItem.packageDeduction = packageCost;
          billItem.finalAmount -= packageCost;
          packageDeduction += packageCost;
        }

        billItem.finalAmount = Math.max(0, billItem.finalAmount);
        subtotalAmount += costResult.totalPrice;
        billItems.push(billItem);
      }
    }

    const discountRate = parseFloat(tenant.discountRate || 0);
    const discountAmount = subtotalAmount * discountRate;
    const taxableAmount = subtotalAmount - freeDeduction - packageDeduction - discountAmount;
    const taxAmount = Math.max(0, taxableAmount * TAX_RATE);
    const totalAmount = Math.max(0, taxableAmount + taxAmount);

    const isZeroBill = totalAmount <= 0;

    const bill = await Bill.create({
      billNo: await generateBillNo(month, t),
      tenantId,
      month,
      status: hasDeadLetters > 0 ? 'pending_confirm' : 'confirmed',
      isZeroBill,
      subtotalAmount,
      freeDeduction,
      packageDeduction,
      discountAmount,
      taxableAmount: Math.max(0, taxableAmount),
      taxAmount,
      totalAmount,
      taxRate: TAX_RATE,
      discountRate,
      hasUnprocessedDeadLetters: hasDeadLetters > 0,
      generationId,
      confirmedAt: hasDeadLetters === 0 ? new Date() : null,
      confirmedBy: hasDeadLetters === 0 ? operator : null,
    }, { transaction: t });

    for (const item of billItems) {
      await BillItem.create({
        ...item,
        billId: bill.id,
      }, { transaction: t });
    }

    await t.commit();
    
    console.log(`Bill generated for tenant ${tenant.code} in ${month}: ¥${totalAmount}`);
    
    await sendBillEmail(bill.id);
    
    return { billId: bill.id, status: 'generated', totalAmount };
  } catch (error) {
    await t.rollback();
    console.error(`Bill generation failed for tenant ${tenantId} in ${month}:`, error);
    throw error;
  }
}

async function generateBillNo(month, transaction) {
  const monthNum = month.replace('-', '');
  const count = await Bill.count({
    where: { month },
    transaction,
  });
  
  const sequence = String(count + 1).padStart(6, '0');
  return `BILL-${monthNum}-${sequence}`;
}

async function sendBillEmail(billId) {
  const bill = await Bill.findByPk(billId, {
    include: [{ model: Tenant }],
  });
  
  if (!bill) return;

  const notification = await Notification.create({
    tenantId: bill.tenantId,
    type: 'bill_ready',
    title: `账单已生成 - ${bill.month}`,
    content: `您${bill.month}月份的账单已生成，账单编号：${bill.billNo}，应付金额：¥${bill.totalAmount}`,
    level: bill.totalAmount > 0 ? 'info' : 'info',
    metadata: {
      billId: bill.id,
      billNo: bill.billNo,
      month: bill.month,
      totalAmount: bill.totalAmount,
    },
  });

  await emailQueue.add({
    type: 'bill_notification',
    notificationId: notification.id,
    billId: bill.id,
  }, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 60000 },
  });
}

export async function regenerateBill(billId, operator) {
  const bill = await Bill.findByPk(billId);
  if (!bill) {
    throw new Error('Bill not found');
  }

  if (bill.status === 'paid') {
    throw new Error('已支付的账单不能重新生成');
  }

  const t = await sequelize.transaction();
  
  try {
    await BillItem.destroy({
      where: { billId },
      transaction: t,
    });

    await Bill.destroy({
      where: { id: billId },
      transaction: t,
    });

    await t.commit();

    await billingQueue.add({
      tenantId: bill.tenantId,
      month: bill.month,
      generationId: `${bill.month}:${bill.tenantId}:regen:${Date.now()}`,
      operator,
    });

    return { success: true, message: '账单已删除并重新加入生成队列' };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function confirmBill(billId, operator) {
  const bill = await Bill.findByPk(billId);
  if (!bill) {
    throw new Error('Bill not found');
  }

  if (bill.status !== 'pending_confirm') {
    throw new Error('只有待确认状态的账单可以确认');
  }

  bill.status = 'confirmed';
  bill.confirmedAt = new Date();
  bill.confirmedBy = operator;
  
  return await bill.save();
}

export async function getBillDetails(billId) {
  return await Bill.findByPk(billId, {
    include: [
      { model: Tenant },
      {
        model: BillItem,
        include: [{ model: ApiInterface }],
      },
    ],
  });
}

export async function listBills(params = {}) {
  const where = {};
  
  if (params.tenantId) where.tenantId = params.tenantId;
  if (params.month) where.month = params.month;
  if (params.status) where.status = params.status;
  if (params.isZeroBill !== undefined) where.isZeroBill = params.isZeroBill;

  return await Bill.findAndCountAll({
    where,
    include: [
      { model: Tenant, attributes: ['id', 'name', 'code'] },
    ],
    order: [['createdAt', 'DESC']],
    limit: params.limit || 50,
    offset: params.offset || 0,
  });
}

export async function createInvoice(billId, operator) {
  const t = await sequelize.transaction();
  
  try {
    const bill = await Bill.findByPk(billId, {
      include: [
        { model: Tenant },
        {
          model: BillItem,
          include: [{ model: ApiInterface }],
        },
      ],
      transaction: t,
    });

    if (!bill) {
      throw new Error('Bill not found');
    }

    if (bill.status !== 'confirmed') {
      throw new Error('只有已确认的账单可以开票');
    }

    const existingInvoice = await Invoice.findOne({
      where: { billId },
      transaction: t,
    });

    if (existingInvoice) {
      await t.commit();
      return existingInvoice;
    }

    const invoiceDate = new Date();
    const year = invoiceDate.getFullYear();

    const maxSequence = await Invoice.max('sequenceNo', {
      where: { year },
      transaction: t,
    });

    const sequenceNo = (maxSequence || 0) + 1;
    const invoiceNo = `INV-${year}-${String(sequenceNo).padStart(6, '0')}`;

    const details = bill.BillItems.map(item => ({
      apiName: item.ApiInterface?.name || '未知接口',
      dimension: item.dimension,
      usage: item.usageAmount,
      unit: item.unit,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      freeDeduction: item.freeDeduction,
      packageDeduction: item.packageDeduction,
      finalAmount: item.finalAmount,
    }));

    const invoice = await Invoice.create({
      invoiceNo,
      billId,
      tenantId: bill.tenantId,
      year,
      sequenceNo,
      companyName: bill.Tenant.companyName || bill.Tenant.name,
      taxNumber: bill.Tenant.taxNumber,
      address: bill.Tenant.address,
      totalAmount: bill.totalAmount,
      taxAmount: bill.taxAmount,
      invoiceDate,
      details,
      issuedBy: operator,
    }, { transaction: t });

    await t.commit();
    
    return invoice;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function getInvoiceDetails(invoiceId) {
  return await Invoice.findByPk(invoiceId, {
    include: [
      { model: Tenant },
      { model: Bill },
    ],
  });
}

export async function listInvoices(params = {}) {
  const where = {};
  
  if (params.tenantId) where.tenantId = params.tenantId;
  if (params.year) where.year = params.year;
  if (params.status) where.status = params.status;

  return await Invoice.findAndCountAll({
    where,
    include: [
      { model: Tenant, attributes: ['id', 'name', 'code'] },
      { model: Bill, attributes: ['id', 'billNo', 'month', 'totalAmount'] },
    ],
    order: [['invoiceDate', 'DESC']],
    limit: params.limit || 50,
    offset: params.offset || 0,
  });
}

export async function generateInvoicePdf(invoiceId) {
  const invoice = await getInvoiceDetails(invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const PDFDocument = (await import('pdfkit')).default;
  const fs = await import('fs');
  const path = await import('path');

  const uploadDir = path.join(process.cwd(), 'uploads', 'invoices');
  if (!fs.default.existsSync(uploadDir)) {
    fs.default.mkdirSync(uploadDir, { recursive: true });
  }

  const pdfPath = path.join(uploadDir, `${invoice.invoiceNo}.pdf`);
  const doc = new PDFDocument({ margin: 50 });

  doc.pipe(fs.default.createWriteStream(pdfPath));

  doc.fontSize(20).text('发票', { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12);
  doc.text(`发票编号：${invoice.invoiceNo}`);
  doc.text(`开票日期：${invoice.invoiceDate.toLocaleDateString('zh-CN')}`);
  doc.moveDown();
  
  doc.text(`开票抬头：${invoice.companyName}`);
  if (invoice.taxNumber) {
    doc.text(`税号：${invoice.taxNumber}`);
  }
  if (invoice.address) {
    doc.text(`地址：${invoice.address}`);
  }
  doc.moveDown();
  
  doc.text('明细清单：');
  doc.moveDown();
  
  const tableTop = doc.y;
  const colWidths = [200, 80, 60, 80, 80];
  
  doc.fontSize(10);
  doc.text('项目', 50, tableTop);
  doc.text('用量', 250, tableTop);
  doc.text('单位', 330, tableTop);
  doc.text('单价', 390, tableTop);
  doc.text('金额', 470, tableTop);
  
  let y = tableTop + 20;
  for (const item of invoice.details) {
    doc.text(item.apiName, 50, y);
    doc.text(item.usage.toString(), 250, y);
    doc.text(item.unit, 330, y);
    doc.text(`¥${item.unitPrice}`, 390, y);
    doc.text(`¥${item.finalAmount}`, 470, y);
    y += 20;
  }
  
  doc.moveDown(2);
  doc.fontSize(12);
  doc.text(`合计金额：¥${invoice.totalAmount}`, { align: 'right' });
  if (invoice.taxAmount > 0) {
    doc.text(`税额：¥${invoice.taxAmount}`, { align: 'right' });
  }
  doc.text(`价税合计：¥${invoice.totalAmount}`, { align: 'right' });

  doc.end();

  invoice.pdfPath = pdfPath;
  await invoice.save();

  return pdfPath;
}

billingQueue.process(processBillGeneration);

export default {
  generateBillsForMonth,
  processBillGeneration,
  regenerateBill,
  confirmBill,
  getBillDetails,
  listBills,
  createInvoice,
  getInvoiceDetails,
  listInvoices,
  generateInvoicePdf,
};
