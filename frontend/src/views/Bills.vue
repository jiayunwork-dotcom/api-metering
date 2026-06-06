<template>
  <div class="bills-container">
    <el-card shadow="hover">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-select
            v-model="searchForm.billingMonth"
            placeholder="选择账期"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="month in availableMonths"
              :key="month"
              :label="month"
              :value="month"
            />
          </el-select>
          <el-input
            v-model="searchForm.keyword"
            placeholder="搜索账单编号/租户"
            clearable
            style="width: 240px"
            :prefix-icon="Search"
            @keyup.enter="loadBills"
          />
          <el-select
            v-model="searchForm.status"
            placeholder="状态筛选"
            clearable
            style="width: 140px"
          >
            <el-option label="草稿" value="draft" />
            <el-option label="待确认" value="pending_confirmation" />
            <el-option label="已确认" value="confirmed" />
            <el-option label="已支付" value="paid" />
            <el-option label="已逾期" value="overdue" />
            <el-option label="零账单" value="zero" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="loadBills">查询</el-button>
          <el-button :icon="Refresh" @click="resetSearch">重置</el-button>
        </div>
        <div class="toolbar-right">
          <el-button :icon="Download" @click="handleExport">导出CSV</el-button>
          <el-button type="primary" :icon="Refresh" @click="handleGenerate">生成账单</el-button>
        </div>
      </div>

      <el-table :data="billList" stripe v-loading="loading">
        <el-table-column prop="billNo" label="账单编号" width="160" />
        <el-table-column label="租户" width="140">
          <template #default="{ row }">
            {{ row.tenant?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="billingMonth" label="账期" width="100" />
        <el-table-column label="明细汇总" width="200">
          <template #default="{ row }">
            <div class="bill-summary">
              <div>接口数: {{ row.stats?.interfaceCount || 0 }}</div>
              <div>总调用: {{ row.stats?.totalCalls || 0 }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="originalAmount" label="原始金额(元)" width="120" align="right">
          <template #default="{ row }">
            {{ row.originalAmount?.toFixed(2) || '0.00' }}
          </template>
        </el-table-column>
        <el-table-column prop="discountAmount" label="优惠金额(元)" width="120" align="right">
          <template #default="{ row }">
            {{ row.discountAmount?.toFixed(2) || '0.00' }}
          </template>
        </el-table-column>
        <el-table-column prop="taxAmount" label="税费(元)" width="100" align="right">
          <template #default="{ row }">
            {{ row.taxAmount?.toFixed(2) || '0.00' }}
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="应付(元)" width="110" align="right">
          <template #default="{ row }">
            <span :class="{ 'zero-bill': row.isZeroBill }">
              {{ row.totalAmount?.toFixed(2) || '0.00' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getBillStatusType(row.status)" size="small">
              {{ row.isZeroBill ? '零账单' : getBillStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="生成时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleView(row)">详情</el-button>
            <el-button
              v-if="row.status === 'pending_confirmation'"
              type="success"
              link
              size="small"
              @click="handleConfirm(row)"
            >
              确认
            </el-button>
            <el-button type="primary" link size="small" @click="handleRegenerate(row)">重新生成</el-button>
            <el-button
              v-if="!row.invoiceId && row.status !== 'draft' && !row.isZeroBill"
              type="warning"
              link
              size="small"
              @click="handleCreateInvoice(row)"
            >
              开发票
            </el-button>
            <el-button
              v-if="row.invoiceId"
              type="primary"
              link
              size="small"
              @click="handleDownloadInvoice(row.invoiceId)"
            >
              下载发票
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadBills"
          @current-change="loadBills"
        />
      </div>
    </el-card>

    <el-dialog v-model="generateDialogVisible" title="生成账单" width="400px">
      <el-form :model="generateForm" label-width="80px">
        <el-form-item label="账期">
          <el-date-picker
            v-model="generateForm.billingMonth"
            type="month"
            placeholder="选择账期"
            value-format="YYYY-MM"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="指定租户">
          <el-select
            v-model="generateForm.tenantId"
            placeholder="不选则全部租户"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="tenant in tenantList"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="generateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmGenerate">确定生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, Download } from '@element-plus/icons-vue';
import { billingApi, tenantApi } from '../api';

const router = useRouter();

const loading = ref(false);
const submitting = ref(false);
const billList = ref([]);
const tenantList = ref([]);
const generateDialogVisible = ref(false);

const searchForm = reactive({
  billingMonth: '',
  keyword: '',
  status: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const generateForm = reactive({
  billingMonth: null,
  tenantId: null,
});

const availableMonths = computed(() => {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
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

async function loadBills() {
  loading.value = true;
  try {
    const res = await billingApi.getBills({
      ...searchForm,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if (res.success) {
      billList.value = res.data.list;
      pagination.total = res.data.total;
    }
  } finally {
    loading.value = false;
  }
}

async function loadTenants() {
  try {
    const res = await tenantApi.getList({ pageSize: 1000 });
    if (res.success) {
      tenantList.value = res.data.list;
    }
  } catch (e) {}
}

function resetSearch() {
  searchForm.billingMonth = '';
  searchForm.keyword = '';
  searchForm.status = '';
  pagination.page = 1;
  loadBills();
}

function handleView(row) {
  router.push(`/bills/${row.id}`);
}

async function handleConfirm(row) {
  try {
    await ElMessageBox.confirm('确认后账单将不可修改，确定要确认此账单吗？', '确认账单', {
      type: 'warning',
    });
    
    const res = await billingApi.confirmBill(row.id);
    if (res.success) {
      ElMessage.success('账单已确认');
      loadBills();
    }
  } catch (e) {}
}

async function handleRegenerate(row) {
  try {
    await ElMessageBox.confirm('重新生成将覆盖现有账单数据，确定继续吗？', '重新生成', {
      type: 'warning',
    });
    
    const res = await billingApi.regenerateBill(row.id);
    if (res.success) {
      ElMessage.success('账单已重新生成');
      loadBills();
    }
  } catch (e) {}
}

async function handleExport() {
  try {
    const res = await billingApi.exportBills(searchForm);
    const blob = new Blob([res], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bills_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error('导出失败');
  }
}

function handleGenerate() {
  generateForm.billingMonth = null;
  generateForm.tenantId = null;
  generateDialogVisible.value = true;
}

async function confirmGenerate() {
  if (!generateForm.billingMonth) {
    ElMessage.warning('请选择账期');
    return;
  }
  
  submitting.value = true;
  try {
    const res = await billingApi.generateBills(generateForm);
    if (res.success) {
      ElMessage.success(`账单生成中，共 ${res.data.count} 个账单`);
      generateDialogVisible.value = false;
      loadBills();
    }
  } finally {
    submitting.value = false;
  }
}

async function handleCreateInvoice(row) {
  try {
    await ElMessageBox.confirm(`确定要为账单 ${row.billNo} 开具发票吗？`, '开具发票', {
      type: 'warning',
    });
    
    const res = await billingApi.createInvoice({ billId: row.id });
    if (res.success) {
      ElMessage.success('发票已开具');
      handleDownloadInvoice(res.data.invoiceId);
      loadBills();
    }
  } catch (e) {}
}

async function handleDownloadInvoice(invoiceId) {
  try {
    const res = await billingApi.downloadInvoicePdf(invoiceId);
    const blob = new Blob([res], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice_${invoiceId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error('下载失败');
  }
}

onMounted(() => {
  loadBills();
  loadTenants();
});
</script>

<style scoped>
.bills-container {
  padding: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.bill-summary {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}

.zero-bill {
  color: #909399;
}
</style>
