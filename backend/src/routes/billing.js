import {
  listBills, getBillDetails, generateBillsForMonth,
  regenerateBill, confirmBill, createInvoice,
  getInvoiceDetails, listInvoices, generateInvoicePdf,
} from '../services/billingService.js';
import { Parser } from 'json2csv';
import fs from 'fs';
import path from 'path';

export default async function billingRoutes(fastify) {
  fastify.get('/api/bills', { onRequest: [fastify.authenticate] }, async (request) => {
    const { page = 1, pageSize = 50, tenantId, month, status, isZeroBill } = request.query;
    
    const result = await listBills({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      tenantId,
      month,
      status,
      isZeroBill: isZeroBill !== undefined ? isZeroBill === 'true' : undefined,
    });

    return {
      success: true,
      data: result.rows,
      total: result.count,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  });

  fastify.get('/api/bills/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const bill = await getBillDetails(request.params.id);
    if (!bill) {
      return reply.status(404).send({ success: false, message: '账单不存在' });
    }
    return { success: true, data: bill };
  });

  fastify.post('/api/bills/generate', { onRequest: [fastify.authenticate] }, async (request) => {
    const { month } = request.body;
    const result = await generateBillsForMonth(month, request.user.username);
    return { success: true, data: result };
  });

  fastify.post('/api/bills/:id/regenerate', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const result = await regenerateBill(request.params.id, request.user.username);
      return { success: true, ...result };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/api/bills/:id/confirm', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const bill = await confirmBill(request.params.id, request.user.username);
      return { success: true, data: bill };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/bills/export/csv', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { month, tenantId, status } = request.query;
    
    const result = await listBills({
      limit: 10000,
      month,
      tenantId,
      status,
    });

    const csvData = result.rows.map(bill => ({
      账单编号: bill.billNo,
      租户名称: bill.Tenant?.name,
      租户编码: bill.Tenant?.code,
      账单月份: bill.month,
      状态: bill.status,
      是否零账单: bill.isZeroBill ? '是' : '否',
      小计金额: bill.subtotalAmount,
      免费抵扣: bill.freeDeduction,
      套餐抵扣: bill.packageDeduction,
      折扣金额: bill.discountAmount,
      税费: bill.taxAmount,
      应付总计: bill.totalAmount,
      生成时间: bill.createdAt,
      确认时间: bill.confirmedAt,
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="bills_${Date.now()}.csv"`);
    
    return '\uFEFF' + csv;
  });

  fastify.get('/api/invoices', { onRequest: [fastify.authenticate] }, async (request) => {
    const { page = 1, pageSize = 50, tenantId, year, status } = request.query;
    
    const result = await listInvoices({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      tenantId,
      year: year ? parseInt(year) : undefined,
      status,
    });

    return {
      success: true,
      data: result.rows,
      total: result.count,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  });

  fastify.get('/api/invoices/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const invoice = await getInvoiceDetails(request.params.id);
    if (!invoice) {
      return reply.status(404).send({ success: false, message: '发票不存在' });
    }
    return { success: true, data: invoice };
  });

  fastify.post('/api/invoices', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { billId } = request.body;
      const invoice = await createInvoice(billId, request.user.username);
      return { success: true, data: invoice };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/api/invoices/:id/pdf', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const pdfPath = await generateInvoicePdf(request.params.id);
      
      if (fs.existsSync(pdfPath)) {
        const fileName = path.basename(pdfPath);
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `inline; filename="${fileName}"`);
        return fs.createReadStream(pdfPath);
      }
      
      return reply.status(404).send({ success: false, message: 'PDF生成失败' });
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });
}
