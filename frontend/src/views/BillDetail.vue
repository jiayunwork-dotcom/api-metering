<template>
  <div class="bill-detail-container">
    <div class="page-header">
      <el-button :icon="ArrowLeft" link @click="router.back()">返回</el-button>
      <h2 class="page-title">账单详情</h2>
      <div class="header-actions">
        <el-tag v-if="bill.isZeroBill" type="info">零账单</el-tag>
        <el-tag :type="getBillStatusType(bill.status)" size="large">
          {{ getBillStatusLabel(bill.status) }}
        </el-tag>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="16">
        <el-card shadow="hover" class="detail-card">
          <template #header>账单信息</template>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="账单编号">{{ bill.billNo }}</el-descriptions-item>
            <el-descriptions-item label="账期">{{ bill.billingMonth }}</el-descriptions-item>
            <el-descriptions-item label="生成时间">{{ formatDate(bill.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="租户名称">{{ bill.tenant?.name }}</el-descriptions-item>
            <el-descriptions-item label="租户编码">{{ bill.tenant?.code }}</el-descriptions-item>
            <el-descriptions-item label="管理员邮箱">{{ bill.tenant?.email }}</el-descriptions-item>
            <el-descriptions-item label="公司名称" :span="3">{{ bill.tenant?.companyName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="公司税号" :span="3">{{ bill.tenant?.taxNumber || '-' }}</el-descriptions-item>
            <el-descriptions-item label="公司地址" :span="3">{{ bill.tenant?.address || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="hover" class="detail-card" style="margin-top: 20px">
          <template #header>费用明细</template>
          <el-table
            :data="bill.items"
            default-expand-all
            v-loading="loading"
          >
            <el-table-column label="接口名称" prop="apiInterface.name" />
            <el-table-column label="计费维度" width="120">
              <template #default="{ row }">
                <el-tag :type="getDimensionType(row.dimension)" size="small">
                  {{ getDimensionLabel(row.dimension) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="用量" width="120" align="right">
              <template #default="{ row }">
                {{ formatUsage(row) }}
              </template>
            </el-table-column>
            <el-table-column label="单价" width="120" align="right">
              <template #default="{ row }">
                {{ row.unitPrice.toFixed(6) }}
              </template>
            </el-table-column>
            <el-table-column label="小计(元)" width="120" align="right">
              <template #default="{ row }">
                {{ row.subtotalAmount.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="优惠(元)" width="120" align="right">
              <template #default="{ row }">
                {{ (row.discountAmount || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="应付(元)" width="120" align="right">
              <template #default="{ row }">
                {{ row.finalAmount.toFixed(2) }}
              </template>
            </el-table-column>

            <template #expand="{ row }">
              <div class="tier-detail">
                <div class="tier-title">阶梯定价明细:</div>
                <el-table :data="row.tierDetails || []" size="small" style="margin-left: 40px">
                  <el-table-column label="阶梯范围" width="200">
                    <template #default="{ t }">
                      {{ t.start }} - {{ t.end === Infinity ? '∞' : t.end }}
                    </template>
                  </el-table-column>
                  <el-table-column label="用量" width="120" align="right" prop="usage" />
                  <el-table-column label="单价" width="120" align="right">
                    <template #default="{ t }">
                      {{ t.price.toFixed(6) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="金额(元)" width="120" align="right">
                    <template #default="{ t }">
                      {{ t.amount.toFixed(2) }}
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </template>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card shadow="hover" class="summary-card">
          <template #header>费用汇总</template>
          <div class="summary-item">
            <span>原始金额</span>
            <span class="amount">{{ bill.originalAmount?.toFixed(2) || '0.00' }} 元</span>
          </div>
          <div class="summary-item">
            <span>免费额度抵扣</span>
            <span class="amount discount">- {{ bill.freeDeductionAmount?.toFixed(2) || '0.00' }} 元</span>
          </div>
          <div class="summary-item">
            <span>套餐抵扣</span>
            <span class="amount discount">- {{ bill.packageDeductionAmount?.toFixed(2) || '0.00' }} 元</span>
          </div>
          <div class="summary-item">
            <span>折扣优惠</span>
            <span class="amount discount">- {{ bill.discountAmount?.toFixed(2) || '0.00' }} 元</span>
          </div>
          <el-divider />
          <div class="summary-item">
            <span>小计</span>
            <span class="amount">{{ ((bill.originalAmount || 0) - (bill.freeDeductionAmount || 0) - (bill.packageDeductionAmount || 0) - (bill.discountAmount || 0)).toFixed(2) }} 元</span>
          </div>
          <div class="summary-item">
            <span>税费 ({{ (bill.taxRate || 0) * 100 }}%)</span>
            <span class="amount">+ {{ bill.taxAmount?.toFixed(2) || '0.00' }} 元</span>
          </div>
          <el-divider />
          <div class="summary-item total">
            <span>应付总计</span>
            <span class="amount total-amount">{{ bill.totalAmount?.toFixed(2) || '0.00' }} 元</span>
          </div>
          <div class="summary-item paid">
            <span>已付金额</span>
            <span class="amount">{{ bill.paidAmount?.toFixed(2) || '0.00' }} 元</span>
          </div>
          <div class="summary-item unpaid">
            <span>待付金额</span>
            <span class="amount unpaid-amount">{{ ((bill.totalAmount || 0) - (bill.paidAmount || 0)).toFixed(2) }} 元</span>
          </div>

          <div class="action-buttons">
            <el-button
              v-if="bill.status === 'pending_confirmation'"
              type="success"
              style="width: 100%"
              @click="handleConfirm"
            >
              确认账单
            </el-button>
            <el-button type="primary" style="width: 100%" @click="handleRegenerate">
              重新生成
            </el-button>
            <el-button
              v-if="!bill.invoiceId && !bill.isZeroBill"
              type="warning"
              style="width: 100%"
              @click="handleCreateInvoice"
            >
              开具发票
            </el-button>
            <el-button v-if="bill.invoiceId" type="primary" style="width: 100%" @click="handleDownloadInvoice">
              下载发票PDF
            </el-button>
          </div>
        </el-card>

        <el-card shadow="hover" v-if="bill.hasDeadLetterEvents" style="margin-top: 20px">
          <template #header>
            <div class="card-header-warning">
              <el-icon color="#E6A23C"><Warning /></el-icon>
              <span>存在死信事件</span>
            </div>
          </template>
          <p class="warning-text">
            该账单所属期间存在 {{ bill.deadLetterCount }} 条处理失败的计量事件，
            可能影响账单准确性。建议先处理死信事件后再确认账单。
          </p>
          <el-button type="primary" link style="padding: 0" @click="router.push('/dead-letters')">
            前往处理死信队列
          </el-button>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Warning } from '@element-plus/icons-vue';
import { billingApi } from '../api';

const route = useRoute();
const router = useRouter();

const billId = route.params.id;
const loading = ref(false);
const bill = ref({
  items: [],
});

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleString('zh-CN') : '-';
}

function getBillStatusType(status) {
  const types = {
    draft: 'info',
    pending_confirmation: 'warning',
    confirmed: 'success',
    paid: 'success',
    overdue: 'danger',
    cancelled: 'info',
  };
  return types[status] || 'info';
}

function getBillStatusLabel(status) {
  const labels = {
    draft: '草稿',
    pending_confirmation: '待确认',
    confirmed: '已确认',
    paid: '已支付',
    overdue: '已逾期',
    cancelled: '已取消',
  };
  return labels[status] || status;
}

function getDimensionType(dim) {
  const types = { calls: 'primary', data_volume: 'success', compute_time: 'warning' };
  return types[dim] || 'info';
}

function getDimensionLabel(dim) {
  const labels = { calls: '调用次数', data_volume: '数据量', compute_time: '计算时长' };
  return labels[dim] || dim;
}

function formatUsage(row) {
  if (row.dimension === 'data_volume') return row.usage + ' MB';
  if (row.dimension === 'compute_time') return row.usage + ' 秒';
  return row.usage + ' 次';
}

async function loadBillDetail() {
  loading.value = true;
  try {
    const res = await billingApi.getBillDetail(billId);
    if (res.success) {
      bill.value = res.data;
    }
  } finally {
    loading.value = false;
  }
}

async function handleConfirm() {
  try {
    await ElMessageBox.confirm('确认后账单将不可修改，确定要确认此账单吗？', '确认账单', {
      type: 'warning',
    });
    
    const res = await billingApi.confirmBill(billId);
    if (res.success) {
      ElMessage.success('账单已确认');
      loadBillDetail();
    }
  } catch (e) {}
}

async function handleRegenerate() {
  try {
    await ElMessageBox.confirm('重新生成将覆盖现有账单数据，确定继续吗？', '重新生成', {
      type: 'warning',
    });
    
    const res = await billingApi.regenerateBill(billId);
    if (res.success) {
      ElMessage.success('账单已重新生成');
      loadBillDetail();
    }
  } catch (e) {}
}

async function handleCreateInvoice() {
  try {
    await ElMessageBox.confirm('确定要为此账单开具发票吗？', '开具发票', {
      type: 'warning',
    });
    
    const res = await billingApi.createInvoice({ billId });
    if (res.success) {
      ElMessage.success('发票已开具');
      handleDownloadInvoice();
      loadBillDetail();
    }
  } catch (e) {}
}

async function handleDownloadInvoice() {
  try {
    const res = await billingApi.downloadInvoicePdf(bill.value.invoiceId);
    const blob = new Blob([res], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice_${bill.value.invoiceId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error('下载失败');
  }
}

onMounted(() => {
  loadBillDetail();
});
</script>

<style scoped>
.bill-detail-container {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  color: #303133;
  flex: 1;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.detail-card {
  margin-bottom: 0;
}

.summary-card {
  position: sticky;
  top: 20px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
}

.summary-item.total {
  font-weight: 600;
  font-size: 16px;
}

.summary-item .amount {
  color: #303133;
}

.summary-item .amount.discount {
  color: #67C23A;
}

.summary-item .total-amount {
  color: #F56C6C;
  font-size: 24px;
  font-weight: 600;
}

.summary-item .unpaid-amount {
  color: #E6A23C;
  font-weight: 600;
}

.action-buttons {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tier-detail {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.tier-title {
  font-weight: 500;
  margin-bottom: 8px;
  color: #606266;
}

.card-header-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #E6A23C;
  font-weight: 500;
}

.warning-text {
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 12px;
}
</style>
