<template>
  <div class="dashboard-container">
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6" v-for="stat in statsData" :key="stat.label">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-icon" :style="{ background: stat.bgColor }">
              <el-icon :size="28" color="#fff"><component :is="stat.icon" /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stat.value }}</div>
              <div class="stat-label">{{ stat.label }}</div>
              <div class="stat-trend" :class="stat.trend > 0 ? 'up' : 'down'">
                <el-icon v-if="stat.trend > 0"><Top /></el-icon>
                <el-icon v-else><Bottom /></el-icon>
                {{ Math.abs(stat.trend) }}% 较上月
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="16">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>调用量趋势</span>
              <el-radio-group v-model="trendPeriod" size="small" @change="loadCallTrend">
                <el-radio-button value="day">按天</el-radio-button>
                <el-radio-button value="week">按周</el-radio-button>
                <el-radio-button value="month">按月</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="trendChartRef" class="chart"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header>
            <span>API调用排行</span>
          </template>
          <div ref="apiRankingChartRef" class="chart small"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span>Top10 高用量租户</span>
          </template>
          <el-table :data="topTenants" stripe>
            <el-table-column type="index" label="排名" width="60" align="center">
              <template #default="{ $index }">
                <el-tag v-if="$index < 3" :type="getRankTagType($index)">{{ $index + 1 }}</el-tag>
                <span v-else>{{ $index + 1 }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="tenant.name" label="租户名称" show-overflow-tooltip />
            <el-table-column prop="callCount" label="调用量" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.callCount) }}
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="费用(元)" align="right">
              <template #default="{ row }">
                {{ row.amount.toFixed(2) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>近期告警</span>
              <el-button type="primary" link size="small" @click="loadNotifications">刷新</el-button>
            </div>
          </template>
          <el-table :data="notifications" style="width: 100%" max-height="300">
            <el-table-column prop="type" label="类型" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="getNotificationType(row.type)" size="small">
                  {{ getNotificationLabel(row.type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="tenant.name" label="租户" width="120" show-overflow-tooltip />
            <el-table-column prop="message" label="内容" show-overflow-tooltip />
            <el-table-column prop="threshold" label="阈值" width="80" align="center">
              <template #default="{ row }">
                {{ row.threshold }}%
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="时间" width="160">
              <template #default="{ row }">
                {{ formatTime(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <span>营收趋势</span>
          </template>
          <div ref="revenueChartRef" class="chart"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue';
import * as echarts from 'echarts';
import {
  DataLine, User, Money, Warning, Top, Bottom,
} from '@element-plus/icons-vue';
import { dashboardApi, usageApi } from '../api';

const trendPeriod = ref('day');
const trendChartRef = ref();
const revenueChartRef = ref();
const apiRankingChartRef = ref();

let trendChart = null;
let revenueChart = null;
let apiRankingChart = null;

const statsData = reactive([
  { label: '本月调用量', value: '0', icon: DataLine, bgColor: '#409EFF', trend: 12.5 },
  { label: '活跃租户数', value: '0', icon: User, bgColor: '#67C23A', trend: 8.3 },
  { label: '本月营收(元)', value: '0', icon: Money, bgColor: '#E6A23C', trend: 15.7 },
  { label: '告警数量', value: '0', icon: Warning, bgColor: '#F56C6C', trend: -5.2 },
]);

const topTenants = ref([]);
const notifications = ref([]);

function formatNumber(num) {
  if (num >= 100000000) return (num / 100000000).toFixed(2) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(2) + '万';
  return num.toLocaleString();
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;
  
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRankTagType(index) {
  const types = ['danger', 'warning', 'primary'];
  return types[index] || 'info';
}

function getNotificationType(type) {
  const types = { quota: 'warning', billing: 'primary', system: 'info' };
  return types[type] || 'info';
}

function getNotificationLabel(type) {
  const labels = { quota: '配额', billing: '账单', system: '系统' };
  return labels[type] || type;
}

async function loadStats() {
  try {
    const res = await dashboardApi.getStats();
    if (res.success) {
      statsData[0].value = formatNumber(res.data.totalCalls);
      statsData[1].value = res.data.activeTenants;
      statsData[2].value = formatNumber(res.data.totalRevenue);
      statsData[3].value = res.data.alertCount;
    }
  } catch (e) {}
}

async function loadCallTrend() {
  try {
    const res = await dashboardApi.getCallTrend({ period: trendPeriod.value });
    if (res.success) {
      const { dates, data } = res.data;
      renderTrendChart(dates, data);
    }
  } catch (e) {}
}

async function loadRevenueTrend() {
  try {
    const res = await dashboardApi.getRevenueTrend();
    if (res.success) {
      const { months, revenue } = res.data;
      renderRevenueChart(months, revenue);
    }
  } catch (e) {}
}

async function loadTopTenants() {
  try {
    const res = await dashboardApi.getTopTenants({ limit: 10 });
    if (res.success) {
      topTenants.value = res.data;
    }
  } catch (e) {}
}

async function loadApiRanking() {
  try {
    const res = await dashboardApi.getApiRanking({ limit: 10 });
    if (res.success) {
      const { apis, counts } = res.data;
      renderApiRankingChart(apis, counts);
    }
  } catch (e) {}
}

async function loadNotifications() {
  try {
    const res = await usageApi.getNotifications({ limit: 10, unreadOnly: true });
    if (res.success) {
      notifications.value = res.data;
    }
  } catch (e) {}
}

function renderTrendChart(dates, data) {
  if (!trendChartRef.value) return;
  
  if (!trendChart) {
    trendChart = echarts.init(trendChartRef.value);
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
          { offset: 0, color: 'rgba(64, 158, 255, 0.5)' },
          { offset: 1, color: 'rgba(64, 158, 255, 0.1)' },
        ]),
      },
      lineStyle: {
        color: '#409EFF',
        width: 2,
      },
      itemStyle: { color: '#409EFF' },
    }],
  };
  
  trendChart.setOption(option);
}

function renderRevenueChart(months, revenue) {
  if (!revenueChartRef.value) return;
  
  if (!revenueChart) {
    revenueChart = echarts.init(revenueChartRef.value);
  }
  
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>营收: ¥{c}',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: months,
    },
    yAxis: {
      type: 'value',
      name: '营收(元)',
    },
    series: [{
      name: '营收',
      type: 'bar',
      data: revenue,
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#E6A23C' },
          { offset: 1, color: '#F5D76E' },
        ]),
        borderRadius: [4, 4, 0, 0],
      },
      barWidth: '50%',
    }],
  };
  
  revenueChart.setOption(option);
}

function renderApiRankingChart(apis, counts) {
  if (!apiRankingChartRef.value) return;
  
  if (!apiRankingChart) {
    apiRankingChart = echarts.init(apiRankingChartRef.value);
  }
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: '{b}<br/>调用量: {c}次',
    },
    grid: {
      left: '3%',
      right: '10%',
      bottom: '3%',
      top: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      name: '调用量',
    },
    yAxis: {
      type: 'category',
      data: apis.reverse(),
      axisLabel: {
        width: 80,
        overflow: 'truncate',
      },
    },
    series: [{
      name: '调用量',
      type: 'bar',
      data: counts.reverse(),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
          { offset: 0, color: '#67C23A' },
          { offset: 1, color: '#95D475' },
        ]),
        borderRadius: [0, 4, 4, 0],
      },
      barWidth: '60%',
      label: {
        show: true,
        position: 'right',
        formatter: '{c}',
      },
    }],
  };
  
  apiRankingChart.setOption(option);
}

function handleResize() {
  trendChart?.resize();
  revenueChart?.resize();
  apiRankingChart?.resize();
}

onMounted(async () => {
  await Promise.all([
    loadStats(),
    loadCallTrend(),
    loadRevenueTrend(),
    loadTopTenants(),
    loadApiRanking(),
    loadNotifications(),
  ]);
  
  window.addEventListener('resize', handleResize);
});
</script>

<style scoped>
.dashboard-container {
  padding: 20px;
}

.stats-row {
  margin-bottom: 20px;
}

.charts-row {
  margin-bottom: 20px;
}

.stat-card {
  border: none;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin: 4px 0;
}

.stat-trend {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
}

.stat-trend.up {
  color: #F56C6C;
}

.stat-trend.down {
  color: #67C23A;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart {
  height: 350px;
  width: 100%;
}

.chart.small {
  height: 300px;
}
</style>
