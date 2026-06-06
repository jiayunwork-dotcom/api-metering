<template>
  <div class="invoices-container">
    <el-card shadow="hover">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="searchForm.keyword"
            placeholder="搜索发票编号/账单编号"
            clearable
            style="width: 240px"
            :prefix-icon="Search"
            @keyup.enter="loadInvoices"
          />
          <el-date-picker
            v-model="searchForm.year"
            type="year"
            placeholder="选择年份"
            value-format="YYYY"
            style="width: 140px"
          />
          <el-button type="primary" :icon="Search" @click="loadInvoices">查询</el-button>
          <el-button :icon="Refresh" @click="resetSearch">重置</el-button>
        </div>
      </div>

      <el-table :data="invoiceList" stripe v-loading="loading">
        <el-table-column prop="invoiceNo" label="发票编号" width="160" />
        <el-table-column label="租户" width="140">
          <template #default="{ row }">
            {{ row.bill?.tenant?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="billNo" label="关联账单" width="160">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="router.push(`/bills/${row.billId}`)">
              {{ row.billNo }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="billingMonth" label="账期" width="100" />
        <el-table-column label="开票抬头" min-width="160">
          <template #default="{ row }">
            {{ row.companyName || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="开票金额(元)" width="130" align="right">
          <template #default="{ row }">
            {{ row.amount?.toFixed(2) || '0.00' }}
          </template>
        </el-table-column>
        <el-table-column prop="taxAmount" label="税额(元)" width="120" align="right">
          <template #default="{ row }">
            {{ row.taxAmount?.toFixed(2) || '0.00' }}
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="价税合计(元)" width="130" align="right">
          <template #default="{ row }">
            {{ row.totalAmount?.toFixed(2) || '0.00' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getInvoiceStatusType(row.status)" size="small">
              {{ getInvoiceStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="issuedAt" label="开票日期" width="120">
          <template #default="{ row }">
            {{ row.issuedAt ? formatDate(row.issuedAt) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleView(row)">详情</el-button>
            <el-button type="primary" link size="small" @click="handleDownload(row)">下载PDF</el-button>
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
          @size-change="loadInvoices"
          @current-change="loadInvoices"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="detailDialogVisible"
      title="发票详情"
      width="600px"
    >
      <div v-if="currentInvoice" class="invoice-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="发票编号">{{ currentInvoice.invoiceNo }}</el-descriptions-item>
          <el-descriptions-item label="开票日期">{{ formatDate(currentInvoice.issuedAt) }}</el-descriptions-item>
          <el-descriptions-item label="租户名称">{{ currentInvoice.bill?.tenant?.name }}</el-descriptions-item>
          <el-descriptions-item label="账期">{{ currentInvoice.billingMonth }}</el-descriptions-item>
          <el-descriptions-item label="发票抬头" :span="2">{{ currentInvoice.companyName }}</el-descriptions-item>
          <el-descriptions-item label="税号" :span="2">{{ currentInvoice.taxNumber }}</el-descriptions-item>
          <el-descriptions-item label="开票地址" :span="2">{{ currentInvoice.address }}</el-descriptions-item>
          <el-descriptions-item label="开票金额">{{ currentInvoice.amount?.toFixed(2) }} 元</el-descriptions-item>
          <el-descriptions-item label="税率">{{ (currentInvoice.taxRate || 0) * 100 }}%</el-descriptions-item>
          <el-descriptions-item label="税额">{{ currentInvoice.taxAmount?.toFixed(2) }} 元</el-descriptions-item>
          <el-descriptions-item label="价税合计">{{ currentInvoice.totalAmount?.toFixed(2) }} 元</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">开票明细</el-divider>
        <el-table :data="currentInvoice.details || []" size="small">
          <el-table-column label="项目" prop="itemName" />
          <el-table-column label="规格" prop="spec" width="120" />
          <el-table-column label="数量" width="100" align="right" prop="quantity" />
          <el-table-column label="单价" width="120" align="right">
            <template #default="{ row }">
              {{ row.unitPrice?.toFixed(6) }}
            </template>
          </el-table-column>
          <el-table-column label="金额" width="120" align="right">
            <template #default="{ row }">
              {{ row.amount?.toFixed(2) }}
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="handleDownload(currentInvoice)">下载PDF</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Refresh } from '@element-plus/icons-vue';
import { billingApi } from '../api';

const router = useRouter();

const loading = ref(false);
const invoiceList = ref([]);
const detailDialogVisible = ref(false);
const currentInvoice = ref(null);

const searchForm = reactive({
  keyword: '',
  year: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleDateString('zh-CN') : '-';
}

function getInvoiceStatusType(status) {
  const types = {
    draft: 'info',
    issued: 'success',
    cancelled: 'danger',
  };
  return types[status] || 'info';
}

function getInvoiceStatusLabel(status) {
  const labels = {
    draft: '草稿',
    issued: '已开具',
    cancelled: '已作废',
  };
  return labels[status] || status;
}

async function loadInvoices() {
  loading.value = true;
  try {
    const res = await billingApi.getInvoices({
      ...searchForm,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if (res.success) {
      invoiceList.value = res.data.list;
      pagination.total = res.data.total;
    }
  } finally {
    loading.value = false;
  }
}

function resetSearch() {
  searchForm.keyword = '';
  searchForm.year = '';
  pagination.page = 1;
  loadInvoices();
}

async function handleView(row) {
  try {
    const res = await billingApi.getInvoiceDetail(row.id);
    if (res.success) {
      currentInvoice.value = res.data;
      detailDialogVisible.value = true;
    }
  } catch (e) {}
}

async function handleDownload(row) {
  try {
    const res = await billingApi.downloadInvoicePdf(row.id);
    const blob = new Blob([res], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${row.invoiceNo || 'invoice'}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error('下载失败');
  }
}

onMounted(() => {
  loadInvoices();
});
</script>

<style scoped>
.invoices-container {
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
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.invoice-detail {
  margin-bottom: 20px;
}
</style>
