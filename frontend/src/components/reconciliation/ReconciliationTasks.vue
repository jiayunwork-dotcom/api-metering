<template>
  <div class="tasks-container">
    <div class="toolbar">
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        手动触发对账
      </el-button>
      <el-form :inline="true" class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable style="width: 140px">
            <el-option label="等待中" value="pending" />
            <el-option label="执行中" value="running" />
            <el-option label="已完成" value="completed" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.taskType" placeholder="全部" clearable style="width: 140px">
            <el-option label="自动全量" value="auto" />
            <el-option label="手动全量" value="manual" />
            <el-option label="局部对账" value="partial" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="loadTasks">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="resetFilters">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-table v-loading="loading" :data="taskList" border stripe>
      <el-table-column prop="taskNo" label="任务编号" width="220">
        <template #default="{ row }">
          <el-link type="primary" @click="viewTaskDetail(row)">
            {{ row.taskNo }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column prop="taskType" label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="getTaskTypeTag(row.taskType)">
            {{ getTaskTypeText(row.taskType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusTag(row.status)">
            {{ getStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="对账范围">
        <template #default="{ row }">
          {{ formatDate(row.startDate) }} ~ {{ formatDate(row.endDate) }}
        </template>
      </el-table-column>
      <el-table-column prop="triggeredBy" label="触发人" width="120" />
      <el-table-column prop="triggeredAt" label="触发时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.triggeredAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="durationMs" label="耗时" width="100">
        <template #default="{ row }">
          {{ formatDuration(row.durationMs) }}
        </template>
      </el-table-column>
      <el-table-column prop="diffCount" label="差异数" width="90" align="center">
        <template #default="{ row }">
          <el-badge :value="row.diffCount" :max="999" :type="row.diffCount > 0 ? 'danger' : 'info'" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="viewTaskDetail(row)">
            详情
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
        @size-change="loadTasks"
        @current-change="loadTasks"
      />
    </div>

    <el-dialog v-model="createDialogVisible" title="手动触发对账" width="600px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="对账类型" required>
          <el-radio-group v-model="createForm.taskType">
            <el-radio label="manual">全量对账</el-radio>
            <el-radio label="partial">局部对账</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="开始日期" required>
          <el-date-picker
            v-model="createForm.startDate"
            type="date"
            placeholder="选择开始日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束日期" required>
          <el-date-picker
            v-model="createForm.endDate"
            type="date"
            placeholder="选择结束日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="createForm.taskType === 'partial'" label="选择租户">
          <el-select
            v-model="createForm.tenantIds"
            multiple
            filterable
            placeholder="选择需要对账的租户（为空表示全部）"
            style="width: 100%"
          >
            <el-option
              v-for="tenant in tenantList"
              :key="tenant.id"
              :label="`${tenant.name} (${tenant.code})`"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreateTask" :loading="creating">
          确认触发
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="对账任务详情" width="900px">
      <div v-if="currentTask" class="task-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="任务编号">{{ currentTask.taskNo }}</el-descriptions-item>
          <el-descriptions-item label="任务类型">
            <el-tag :type="getTaskTypeTag(currentTask.taskType)">
              {{ getTaskTypeText(currentTask.taskType) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTag(currentTask.status)">
              {{ getStatusText(currentTask.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="执行进度">
            <el-progress :percentage="currentTask.progress || 0" :status="currentTask.status === 'failed' ? 'exception' : ''" />
          </el-descriptions-item>
          <el-descriptions-item label="对账范围" :span="2">
            {{ formatDate(currentTask.startDate) }} ~ {{ formatDate(currentTask.endDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="触发人">{{ currentTask.triggeredBy }}</el-descriptions-item>
          <el-descriptions-item label="触发时间">{{ formatDateTime(currentTask.triggeredAt) }}</el-descriptions-item>
          <el-descriptions-item label="开始执行">{{ formatDateTime(currentTask.startedAt) }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{ formatDateTime(currentTask.completedAt) }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatDuration(currentTask.durationMs) }}</el-descriptions-item>
          <el-descriptions-item label="检查维度">{{ currentTask.totalChecked }}</el-descriptions-item>
        </el-descriptions>

        <div class="stats-section">
          <h4>差异统计</h4>
          <el-row :gutter="20">
            <el-col :span="6">
              <el-statistic title="总差异数" :value="currentTask.diffCount || 0" value-style="color: #F56C6C" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="配额偏差" :value="currentTask.quotaDiffCount || 0" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="聚合偏差" :value="currentTask.aggregationDiffCount || 0" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="事件缺失" :value="currentTask.eventMissingCount || 0" />
            </el-col>
          </el-row>
        </div>

        <div class="chart-section" v-if="currentTask.consistencyStats">
          <h4>各维度一致性</h4>
          <div ref="chartRef" class="chart-container"></div>
        </div>

        <div class="diff-section" v-if="currentTask.ReconciliationDiffs?.length > 0">
          <h4>差异详情列表</h4>
          <el-table :data="currentTask.ReconciliationDiffs" max-height="300" border size="small">
            <el-table-column label="严重程度" width="100">
              <template #default="{ row }">
                <el-tag :type="getSeverityTag(row.severity)">
                  {{ getSeverityText(row.severity) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="差异类型" width="130">
              <template #default="{ row }">
                {{ getDiffTypeText(row.diffType) }}
              </template>
            </el-table-column>
            <el-table-column label="租户" width="150">
              <template #default="{ row }">
                {{ row.Tenant?.name }}
              </template>
            </el-table-column>
            <el-table-column label="接口" width="150">
              <template #default="{ row }">
                {{ row.ApiInterface?.name }}
              </template>
            </el-table-column>
            <el-table-column prop="dateKey" label="日期" width="120" />
            <el-table-column prop="dimension" label="维度" width="100" />
            <el-table-column prop="eventSumValue" label="事件统计" width="100" align="right" />
            <el-table-column prop="dbAggregationValue" label="聚合值" width="100" align="right" />
            <el-table-column prop="redisQuotaValue" label="Redis配额" width="100" align="right" />
            <el-table-column prop="diffAmount" label="差异量" width="100" align="right">
              <template #default="{ row }">
                <span style="color: #F56C6C">{{ row.diffAmount }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Refresh } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { reconciliationApi, tenantApi } from '../../api';
import dayjs from 'dayjs';

const loading = ref(false);
const creating = ref(false);
const taskList = ref([]);
const tenantList = ref([]);
const currentTask = ref(null);
const createDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const chartRef = ref(null);
let chartInstance = null;

const filters = reactive({
  status: '',
  taskType: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const createForm = reactive({
  taskType: 'manual',
  startDate: dayjs().subtract(1, 'day').toDate(),
  endDate: dayjs().subtract(1, 'day').toDate(),
  tenantIds: [],
});

onMounted(() => {
  loadTasks();
  loadTenants();
});

async function loadTenants() {
  try {
    const res = await tenantApi.getList({ pageSize: 1000 });
    if (res.success) {
      tenantList.value = res.data;
    }
  } catch (e) {}
}

async function loadTasks() {
  loading.value = true;
  try {
    const res = await reconciliationApi.getTasks({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filters.status || undefined,
      taskType: filters.taskType || undefined,
    });
    if (res.success) {
      taskList.value = res.data;
      pagination.total = res.total;
    }
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.status = '';
  filters.taskType = '';
  pagination.page = 1;
  loadTasks();
}

function showCreateDialog() {
  createForm.taskType = 'manual';
  createForm.startDate = dayjs().subtract(1, 'day').toDate();
  createForm.endDate = dayjs().subtract(1, 'day').toDate();
  createForm.tenantIds = [];
  createDialogVisible.value = true;
}

async function submitCreateTask() {
  if (!createForm.startDate || !createForm.endDate) {
    ElMessage.warning('请选择对账日期范围');
    return;
  }
  
  creating.value = true;
  try {
    const res = await reconciliationApi.createTask({
      taskType: createForm.taskType,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      tenantIds: createForm.taskType === 'partial' && createForm.tenantIds.length > 0 
        ? createForm.tenantIds 
        : null,
    });
    if (res.success) {
      ElMessage.success(res.message || '对账任务已提交');
      createDialogVisible.value = false;
      loadTasks();
    }
  } finally {
    creating.value = false;
  }
}

async function viewTaskDetail(row) {
  try {
    const res = await reconciliationApi.getTaskDetail(row.id);
    if (res.success) {
      currentTask.value = res.data;
      detailDialogVisible.value = true;
      await nextTick();
      renderChart();
    }
  } catch (e) {}
}

function renderChart() {
  if (!chartRef.value || !currentTask.value?.consistencyStats) return;
  
  if (chartInstance) {
    chartInstance.dispose();
  }
  
  chartInstance = echarts.init(chartRef.value);
  
  const stats = currentTask.value.consistencyStats;
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: '{b}: {c}%',
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: ['调用次数', '数据传输', '计算时长'],
      axisLabel: { color: '#606266' },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { formatter: '{value}%', color: '#606266' },
    },
    series: [{
      type: 'bar',
      data: [
        { value: parseFloat(stats.count) || 100, itemStyle: { color: getConsistencyColor(stats.count) } },
        { value: parseFloat(stats.data_transfer) || 100, itemStyle: { color: getConsistencyColor(stats.data_transfer) } },
        { value: parseFloat(stats.compute_time) || 100, itemStyle: { color: getConsistencyColor(stats.compute_time) } },
      ],
      label: {
        show: true,
        position: 'top',
        formatter: '{c}%',
        color: '#606266',
      },
      barWidth: 60,
    }],
  };
  
  chartInstance.setOption(option);
}

function getConsistencyColor(value) {
  const v = parseFloat(value);
  if (v >= 100) return '#67C23A';
  if (v >= 95) return '#E6A23C';
  return '#F56C6C';
}

function getTaskTypeTag(type) {
  const map = { auto: 'info', manual: 'success', partial: 'warning' };
  return map[type] || 'info';
}

function getTaskTypeText(type) {
  const map = { auto: '自动全量', manual: '手动全量', partial: '局部对账' };
  return map[type] || type;
}

function getStatusTag(status) {
  const map = { pending: 'info', running: 'warning', completed: 'success', failed: 'danger' };
  return map[status] || 'info';
}

function getStatusText(status) {
  const map = { pending: '等待中', running: '执行中', completed: '已完成', failed: '失败' };
  return map[status] || status;
}

function getSeverityTag(severity) {
  const map = { critical: 'danger', warning: 'warning', minor: 'success' };
  return map[severity] || 'info';
}

function getSeverityText(severity) {
  const map = { critical: '严重', warning: '警告', minor: '轻微' };
  return map[severity] || severity;
}

function getDiffTypeText(type) {
  const map = {
    quota_deviation: '配额偏差',
    aggregation_deviation: '聚合偏差',
    event_missing: '事件缺失',
    cross_month_misplacement: '跨月归属错误',
  };
  return map[type] || type;
}

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD');
}

function formatDateTime(date) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

watch(detailDialogVisible, (val) => {
  if (!val && chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
});
</script>

<style scoped>
.tasks-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-form {
  margin: 0;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.task-detail {
  padding: 10px 0;
}

.stats-section {
  margin-top: 24px;
}

.stats-section h4,
.chart-section h4,
.diff-section h4 {
  margin: 20px 0 12px 0;
  padding-left: 10px;
  border-left: 3px solid #409EFF;
  color: #303133;
}

.chart-container {
  height: 250px;
  width: 100%;
}
</style>
