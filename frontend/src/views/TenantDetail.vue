<template>
  <div class="tenant-detail-container">
    <div class="page-header">
      <el-button :icon="ArrowLeft" link @click="router.back()">返回</el-button>
      <h2 class="page-title">租户详情 - {{ tenant.name }}</h2>
    </div>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card shadow="hover" class="info-card">
          <template #header>基本信息</template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="租户ID">{{ tenant.id }}</el-descriptions-item>
            <el-descriptions-item label="租户编码">{{ tenant.code }}</el-descriptions-item>
            <el-descriptions-item label="租户名称">{{ tenant.name }}</el-descriptions-item>
            <el-descriptions-item label="管理员邮箱">{{ tenant.email }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ tenant.phone }}</el-descriptions-item>
            <el-descriptions-item label="公司名称">{{ tenant.companyName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="公司税号">{{ tenant.taxNumber || '-' }}</el-descriptions-item>
            <el-descriptions-item label="公司地址">{{ tenant.address || '-' }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="tenant.status === 'active' ? 'success' : 'info'">
                {{ tenant.status === 'active' ? '正常' : '停用' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDate(tenant.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ tenant.remark || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card shadow="hover" class="quota-card">
          <template #header>
            <div class="card-header-flex">
              <span>配额管理</span>
              <el-button type="primary" size="small" :icon="Plus" @click="handleAddQuota">新增配额</el-button>
            </div>
          </template>
          <el-table :data="quotas" v-loading="quotaLoading">
            <el-table-column label="类型" width="100">
              <template #default="{ row }">
                <el-tag :type="getQuotaTypeColor(row.type)" size="small">
                  {{ getQuotaTypeLabel(row.type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="范围" width="120">
              <template #default="{ row }">
                {{ row.scope === 'global' ? '全局' : row.apiInterface?.name || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="额度" width="100" align="right">
              <template #default="{ row }">
                {{ formatQuotaValue(row) }}
              </template>
            </el-table-column>
            <el-table-column label="已使用" width="100" align="right">
              <template #default="{ row }">
                {{ formatQuotaValue(row, row.used) }}
              </template>
            </el-table-column>
            <el-table-column label="使用进度">
              <template #default="{ row }">
                <el-progress
                  :percentage="Math.min(Math.round((row.used / row.limit) * 100), 100)"
                  :color="getQuotaColor(row.used / row.limit)"
                />
              </template>
            </el-table-column>
            <el-table-column label="计费周期" width="100">
              <template #default="{ row }">
                {{ row.period === 'monthly' ? '月度' : row.period }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                  {{ row.status === 'active' ? '生效' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="handleEditQuota(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-flex">
              <span>本月用量趋势</span>
              <el-select v-model="usageApiId" placeholder="选择API" clearable style="width: 200px" size="small">
                <el-option
                  v-for="api in apiInterfaces"
                  :key="api.id"
                  :label="api.name"
                  :value="api.id"
                />
              </el-select>
            </div>
          </template>
          <div ref="usageChartRef" class="chart"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>历史账单</template>
          <el-table :data="bills" v-loading="billLoading">
            <el-table-column prop="billNo" label="账单编号" width="160" />
            <el-table-column prop="billingMonth" label="账期" width="120" />
            <el-table-column prop="totalAmount" label="总金额(元)" width="120" align="right">
              <template #default="{ row }">
                {{ row.totalAmount.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="paidAmount" label="已付金额(元)" width="120" align="right">
              <template #default="{ row }">
                {{ row.paidAmount.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="getBillStatusType(row.status)" size="small">
                  {{ getBillStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="生成时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="router.push(`/bills/${row.id}`)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog
      v-model="quotaDialogVisible"
      :title="isEditQuota ? '编辑配额' : '新增配额'"
      width="500px"
    >
      <el-form :model="quotaForm" :rules="quotaRules" ref="quotaFormRef" label-width="100px">
        <el-form-item label="配额类型" prop="type">
          <el-select v-model="quotaForm.type" style="width: 100%">
            <el-option label="免费额度" value="free" />
            <el-option label="套餐包含" value="package" />
            <el-option label="硬限制" value="hard_limit" />
          </el-select>
        </el-form-item>
        <el-form-item label="适用范围" prop="scope">
          <el-select v-model="quotaForm.scope" style="width: 100%">
            <el-option label="全局" value="global" />
            <el-option label="指定API" value="api" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="quotaForm.scope === 'api'" label="API接口" prop="apiInterfaceId">
          <el-select v-model="quotaForm.apiInterfaceId" style="width: 100%">
            <el-option
              v-for="api in apiInterfaces"
              :key="api.id"
              :label="api.name"
              :value="api.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="计量单位" prop="unit">
          <el-select v-model="quotaForm.unit" style="width: 100%">
            <el-option label="调用次数" value="calls" />
            <el-option label="数据量(MB)" value="data_mb" />
            <el-option label="计算时长(秒)" value="compute_seconds" />
          </el-select>
        </el-form-item>
        <el-form-item label="额度" prop="limit">
          <el-input-number v-model="quotaForm.limit" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="计费周期" prop="period">
          <el-select v-model="quotaForm.period" style="width: 100%">
            <el-option label="月度" value="monthly" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quotaDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitQuota">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Plus } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { tenantApi, ruleApi, billingApi, usageApi } from '../api';

const route = useRoute();
const router = useRouter();

const tenantId = route.params.id;
const tenant = ref({});
const quotas = ref([]);
const bills = ref([]);
const apiInterfaces = ref([]);
const usageApiId = ref('');

const quotaLoading = ref(false);
const billLoading = ref(false);
const submitting = ref(false);
const quotaDialogVisible = ref(false);
const isEditQuota = ref(false);
const quotaFormRef = ref();

const usageChartRef = ref();
let usageChart = null;

const quotaForm = reactive({
  id: null,
  type: 'free',
  scope: 'global',
  apiInterfaceId: null,
  unit: 'calls',
  limit: 10000,
  period: 'monthly',
  status: 'active',
});

const quotaRules = {
  type: [{ required: true, message: '请选择配额类型', trigger: 'change' }],
  scope: [{ required: true, message: '请选择适用范围', trigger: 'change' }],
  apiInterfaceId: [{ required: true, message: '请选择API接口', trigger: 'change' }],
  unit: [{ required: true, message: '请选择计量单位', trigger: 'change' }],
  limit: [{ required: true, message: '请输入额度', trigger: 'blur' }],
  period: [{ required: true, message: '请选择计费周期', trigger: 'change' }],
};

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleString('zh-CN') : '-';
}

function getQuotaTypeColor(type) {
  const colors = { free: 'success', package: 'primary', hard_limit: 'danger' };
  return colors[type] || 'info';
}

function getQuotaTypeLabel(type) {
  const labels = { free: '免费', package: '套餐', hard_limit: '硬限制' };
  return labels[type] || type;
}

function getQuotaColor(ratio) {
  if (ratio >= 0.95) return '#F56C6C';
  if (ratio >= 0.8) return '#E6A23C';
  return '#67C23A';
}

function formatQuotaValue(row, value) {
  const val = value !== undefined ? value : row.limit;
  if (row.unit === 'data_mb') return val + ' MB';
  if (row.unit === 'compute_seconds') return val + ' 秒';
  return val + ' 次';
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

async function loadTenantDetail() {
  try {
    const res = await tenantApi.getDetail(tenantId);
    if (res.success) {
      tenant.value = res.data;
    }
  } catch (e) {}
}

async function loadQuotas() {
  quotaLoading.value = true;
  try {
    const res = await tenantApi.getQuotas(tenantId);
    if (res.success) {
      quotas.value = res.data || [];
    }
  } finally {
    quotaLoading.value = false;
  }
}

async function loadBills() {
  billLoading.value = true;
  try {
    const res = await billingApi.getBills({ tenantId, pageSize: 100 });
    if (res.success) {
      bills.value = res.data || [];
    }
  } finally {
    billLoading.value = false;
  }
}

async function loadApiInterfaces() {
  try {
    const res = await ruleApi.getApiInterfaces();
    if (res.success) {
      apiInterfaces.value = res.data || [];
    }
  } catch (e) {}
}

async function loadUsageTrend() {
  try {
    const res = await usageApi.getTenantCurrent(tenantId, {
      apiInterfaceId: usageApiId.value,
      aggregate: 'day',
    });
    if (res.success) {
      renderUsageChart(res.data.dates, res.data.usage);
    }
  } catch (e) {}
}

function renderUsageChart(dates, data) {
  if (!usageChartRef.value) return;
  
  if (!usageChart) {
    usageChart = echarts.init(usageChartRef.value);
  }
  
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>调用量: {c}次',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
    },
    yAxis: {
      type: 'value',
      name: '调用量',
    },
    series: [{
      name: '调用量',
      type: 'line',
      smooth: true,
      data: data,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(103, 194, 58, 0.5)' },
          { offset: 1, color: 'rgba(103, 194, 58, 0.1)' },
        ]),
      },
      lineStyle: {
        color: '#67C23A',
        width: 2,
      },
      itemStyle: { color: '#67C23A' },
    }],
  };
  
  usageChart.setOption(option);
}

function handleAddQuota() {
  isEditQuota.value = false;
  Object.assign(quotaForm, {
    id: null,
    type: 'free',
    scope: 'global',
    apiInterfaceId: null,
    unit: 'calls',
    limit: 10000,
    period: 'monthly',
    status: 'active',
  });
  quotaDialogVisible.value = true;
}

function handleEditQuota(row) {
  isEditQuota.value = true;
  Object.assign(quotaForm, row);
  quotaForm.apiInterfaceId = row.apiInterfaceId;
  quotaDialogVisible.value = true;
}

async function handleSubmitQuota() {
  if (!quotaFormRef.value) return;
  
  await quotaFormRef.value.validate(async (valid) => {
    if (!valid) return;
    
    submitting.value = true;
    try {
      const res = isEditQuota.value
        ? await tenantApi.updateQuota(tenantId, quotaForm.id, quotaForm)
        : await tenantApi.createQuota(tenantId, quotaForm);
      
      if (res.success) {
        ElMessage.success(isEditQuota.value ? '修改成功' : '创建成功');
        quotaDialogVisible.value = false;
        loadQuotas();
      }
    } finally {
      submitting.value = false;
    }
  });
}

function handleResize() {
  usageChart?.resize();
}

onMounted(async () => {
  await Promise.all([
    loadTenantDetail(),
    loadQuotas(),
    loadBills(),
    loadApiInterfaces(),
  ]);
  loadUsageTrend();
  
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  usageChart?.dispose();
});
</script>

<style scoped>
.tenant-detail-container {
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
}

.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart {
  height: 300px;
  width: 100%;
}

.info-card {
  margin-bottom: 20px;
}
</style>
