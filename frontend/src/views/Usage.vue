<template>
  <div class="usage-container">
    <el-card shadow="hover">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-select
            v-model="queryForm.tenantId"
            placeholder="选择租户"
            filterable
            clearable
            style="width: 200px"
          >
            <el-option
              v-for="t in tenantList"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            />
          </el-select>
          <el-select
            v-model="queryForm.apiInterfaceId"
            placeholder="选择API"
            filterable
            clearable
            style="width: 200px"
          >
            <el-option
              v-for="api in apiList"
              :key="api.id"
              :label="api.name"
              :value="api.id"
            />
          </el-select>
          <el-date-picker
            v-model="queryForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 320px"
          />
          <el-select
            v-model="queryForm.aggregate"
            placeholder="聚合粒度"
            style="width: 140px"
          >
            <el-option label="分钟级" value="minute" />
            <el-option label="小时级" value="hour" />
            <el-option label="日级" value="day" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="loadData">查询</el-button>
          <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
        </div>
        <div class="toolbar-right">
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="chart">图表</el-radio-button>
            <el-radio-button value="table">表格</el-radio-button>
          </el-radio-group>
          <el-button type="primary" :icon="Download" @click="handleExport">导出</el-button>
        </div>
      </div>

      <div v-if="viewMode === 'chart'" class="chart-container">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-card>
              <template #header>调用量趋势</template>
              <div ref="callChartRef" class="chart"></div>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card>
              <template #header>数据传输量 (MB)</template>
              <div ref="dataChartRef" class="chart"></div>
            </el-card>
          </el-col>
        </el-row>
        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="12">
            <el-card>
              <template #header>计算时长 (秒)</template>
              <div ref="computeChartRef" class="chart"></div>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card>
              <template #header>费用估算 (元)</template>
              <div ref="costChartRef" class="chart"></div>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <div v-else class="table-container">
        <el-table
          :data="usageData"
          stripe
          v-loading="loading"
          max-height="600"
        >
          <el-table-column prop="dateTime" label="时间" width="180" />
          <el-table-column label="租户" width="140">
            <template #default="{ row }">
              {{ row.tenant?.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="API接口" width="160">
            <template #default="{ row }">
              {{ row.apiInterface?.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="聚合粒度" width="100" align="center">
            <template #default="{ row }">
              <el-tag size="small">{{ getAggregateLabel(row.aggregateLevel) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="callCount" label="调用次数" width="120" align="right">
            <template #default="{ row }">
              {{ (row.callCount || 0).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column prop="requestSize" label="请求大小(KB)" width="130" align="right">
            <template #default="{ row }">
              {{ ((row.requestSize || 0) / 1024).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column prop="responseSize" label="响应大小(KB)" width="130" align="right">
            <template #default="{ row }">
              {{ ((row.responseSize || 0) / 1024).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column prop="totalDataSize" label="总数据量(MB)" width="130" align="right">
            <template #default="{ row }">
              {{ ((row.totalDataSize || 0) / 1024 / 1024).toFixed(4) }}
            </template>
          </el-table-column>
          <el-table-column prop="totalDuration" label="总耗时(秒)" width="120" align="right">
            <template #default="{ row }">
              {{ ((row.totalDuration || 0) / 1000).toFixed(4) }}
            </template>
          </el-table-column>
          <el-table-column label="成功率" width="100" align="center">
            <template #default="{ row }">
              <span :class="row.successRate >= 0.99 ? 'success' : row.successRate >= 0.95 ? 'warning' : 'danger'">
                {{ ((row.successRate || 0) * 100).toFixed(2) }}%
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="estimatedCost" label="估算费用(元)" width="130" align="right">
            <template #default="{ row }">
              {{ (row.estimatedCost || 0).toFixed(4) }}
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            :page-sizes="[20, 50, 100, 200]"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="loadData"
            @current-change="loadData"
          />
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Download } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { usageApi, tenantApi, ruleApi } from '../api';

const loading = ref(false);
const viewMode = ref('chart');
const usageData = ref([]);
const tenantList = ref([]);
const apiList = ref([]);

const callChartRef = ref();
const dataChartRef = ref();
const computeChartRef = ref();
const costChartRef = ref();

let callChart = null;
let dataChart = null;
let computeChart = null;
let costChart = null;

const queryForm = reactive({
  tenantId: null,
  apiInterfaceId: null,
  dateRange: [],
  aggregate: 'day',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

function getAggregateLabel(level) {
  const labels = { minute: '分钟', hour: '小时', day: '日' };
  return labels[level] || level;
}

async function loadTenants() {
  try {
    const res = await tenantApi.getList({ pageSize: 1000 });
    if (res.success) {
      tenantList.value = res.data;
    }
  } catch (e) {}
}

async function loadApis() {
  try {
    const res = await ruleApi.getApiInterfaces();
    if (res.success) {
      apiList.value = res.data;
    }
  } catch (e) {}
}

async function loadData() {
  if (!queryForm.dateRange || queryForm.dateRange.length < 2) {
    ElMessage.warning('请选择查询时间范围');
    return;
  }

  loading.value = true;
  try {
    const res = await usageApi.query({
      tenantId: queryForm.tenantId,
      apiInterfaceId: queryForm.apiInterfaceId,
      startDate: queryForm.dateRange[0],
      endDate: queryForm.dateRange[1],
      aggregate: queryForm.aggregate,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if (res.success) {
      usageData.value = res.data;
      pagination.total = res.total;
      
      if (viewMode.value === 'chart') {
        renderCharts(res.data);
      }
    }
  } finally {
    loading.value = false;
  }
}

function renderCharts(data) {
  const dates = [...new Set(data.map(d => d.dateTime))].sort();
  
  const callData = dates.map(date => {
    const items = data.filter(d => d.dateTime === date);
    return items.reduce((sum, d) => sum + (d.callCount || 0), 0);
  });
  
  const dataData = dates.map(date => {
    const items = data.filter(d => d.dateTime === date);
    return items.reduce((sum, d) => sum + ((d.totalDataSize || 0) / 1024 / 1024), 0);
  });
  
  const computeData = dates.map(date => {
    const items = data.filter(d => d.dateTime === date);
    return items.reduce((sum, d) => sum + ((d.totalDuration || 0) / 1000), 0);
  });
  
  const costData = dates.map(date => {
    const items = data.filter(d => d.dateTime === date);
    return items.reduce((sum, d) => sum + (d.estimatedCost || 0), 0);
  });

  renderLineChart(callChartRef, callChart, dates, callData, '调用量', '#409EFF');
  renderLineChart(dataChartRef, dataChart, dates, dataData, '数据量(MB)', '#67C23A');
  renderLineChart(computeChartRef, computeChart, dates, computeData, '计算时长(秒)', '#E6A23C');
  renderLineChart(costChartRef, costChart, dates, costData, '费用(元)', '#F56C6C');
}

function renderLineChart(refEl, chart, dates, data, name, color) {
  if (!refEl.value) return;
  
  if (!chart) {
    chart = echarts.init(refEl.value);
  }
  
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>' + name + ': {c}',
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
      axisLabel: {
        rotate: dates.length > 15 ? 45 : 0,
        fontSize: 10,
      },
    },
    yAxis: {
      type: 'value',
      name,
    },
    series: [{
      name,
      type: 'line',
      smooth: true,
      data,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: color + '80' },
          { offset: 1, color: color + '20' },
        ]),
      },
      lineStyle: {
        color,
        width: 2,
      },
      itemStyle: { color },
    }],
  };
  
  chart.setOption(option);
}

function resetQuery() {
  queryForm.tenantId = null;
  queryForm.apiInterfaceId = null;
  queryForm.dateRange = [];
  queryForm.aggregate = 'day';
  pagination.page = 1;
}

async function handleExport() {
  if (!queryForm.dateRange || queryForm.dateRange.length < 2) {
    ElMessage.warning('请选择查询时间范围');
    return;
  }

  try {
    const res = await usageApi.export({
      tenantId: queryForm.tenantId,
      apiInterfaceId: queryForm.apiInterfaceId,
      startDate: queryForm.dateRange[0],
      endDate: queryForm.dateRange[1],
      aggregate: queryForm.aggregate,
    });
    const blob = new Blob([res], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error('导出失败');
  }
}

function handleResize() {
  callChart?.resize();
  dataChart?.resize();
  computeChart?.resize();
  costChart?.resize();
}

watch(viewMode, (val) => {
  if (val === 'chart' && usageData.value.length > 0) {
    setTimeout(() => renderCharts(usageData.value), 100);
  }
});

onMounted(async () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  queryForm.dateRange = [
    lastMonth.toISOString().slice(0, 10),
    now.toISOString().slice(0, 10),
  ];
  
  await Promise.all([loadTenants(), loadApis()]);
  loadData();
  
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  callChart?.dispose();
  dataChart?.dispose();
  computeChart?.dispose();
  costChart?.dispose();
});
</script>

<style scoped>
.usage-container {
  padding: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.chart-container {
  margin-top: 20px;
}

.chart {
  height: 300px;
  width: 100%;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.success {
  color: #67C23A;
  font-weight: 500;
}

.warning {
  color: #E6A23C;
  font-weight: 500;
}

.danger {
  color: #F56C6C;
  font-weight: 500;
}
</style>
