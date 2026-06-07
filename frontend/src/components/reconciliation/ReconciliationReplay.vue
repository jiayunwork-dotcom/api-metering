<template>
  <div class="replay-container">
    <div class="toolbar">
      <div class="action-buttons">
        <el-button
          type="primary"
          :disabled="selectedEvents.length === 0 || replaying"
          @click="showReplayDialog(false)"
        >
          <el-icon><VideoPlay /></el-icon>
          批量重放
        </el-button>
        <el-button
          type="warning"
          :disabled="selectedEvents.length === 0 || replaying"
          @click="showReplayDialog(true)"
        >
          <el-icon><View /></el-icon>
          Dry-Run预览
        </el-button>
      </div>
      <el-form :inline="true" class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable style="width: 140px">
            <el-option label="待处理" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="已重放" value="reprocessed" />
            <el-option label="失败" value="failed" />
            <el-option label="已忽略" value="ignored" />
          </el-select>
        </el-form-item>
        <el-form-item label="租户">
          <el-select v-model="filters.tenantId" placeholder="全部" clearable filterable style="width: 180px">
            <el-option
              v-for="tenant in tenantList"
              :key="tenant.id"
              :label="`${tenant.name} (${tenant.code})`"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="月份">
          <el-date-picker
            v-model="filters.month"
            type="month"
            placeholder="选择月份"
            clearable
            style="width: 140px"
            value-format="YYYY-MM"
          />
        </el-form-item>
        <el-form-item>
          <el-button @click="loadDeadLetters">
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

    <el-table
      v-loading="loading"
      :data="eventList"
      border
      stripe
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" :selectable="checkSelectable" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusTag(row.status)" size="small">
            {{ getStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="租户" width="140">
        <template #default="{ row }">
          {{ getTenantName(row.tenantId || row.eventData?.tenantId) }}
        </template>
      </el-table-column>
      <el-table-column label="接口" width="140">
        <template #default="{ row }">
          {{ row.eventData?.apiName || row.eventData?.apiInterfaceId }}
        </template>
      </el-table-column>
      <el-table-column label="事件时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.eventData?.timestamp) }}
        </template>
      </el-table-column>
      <el-table-column label="归属月份" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.eventData?.timestamp" :type="getMonthTag(row)">
            {{ getCorrectMonth(row) }}
          </el-tag>
          <span v-else>{{ row.month }}</span>
        </template>
      </el-table-column>
      <el-table-column label="事件数据" min-width="200">
        <template #default="{ row }">
          <div class="event-data-preview">
            <span v-if="row.eventData?.statusCode">状态: {{ row.eventData.statusCode }}</span>
            <span v-if="row.eventData?.duration">耗时: {{ row.eventData.duration }}ms</span>
            <span v-if="row.eventData?.dataTransferMB">流量: {{ row.eventData.dataTransferMB.toFixed(2) }}MB</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="错误信息" min-width="200">
        <template #default="{ row }">
          <el-tooltip :content="row.errorMessage" placement="top">
            <span class="error-text">{{ truncateText(row.errorMessage, 50) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="retryCount" label="重试次数" width="90" align="center" />
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="viewEventDetail(row)">
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
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadDeadLetters"
        @current-change="loadDeadLetters"
      />
    </div>

    <el-dialog v-model="replayDialogVisible" :title="isDryRun ? 'Dry-Run预览' : '批量重放确认'" width="500px">
      <div class="replay-confirm">
        <p>您选择了 <strong style="color: #409EFF">{{ selectedEvents.length }}</strong> 条死信事件，</p>
        <p v-if="isDryRun">确定要执行 <strong>Dry-Run预览</strong> 吗？此操作不会实际写入数据。</p>
        <p v-else>确定要执行 <strong>批量重放</strong> 吗？重放时将按事件原始时间戳归入对应月份。</p>
        <el-alert
          v-if="!isDryRun"
          title="提示"
          type="info"
          :closable="false"
          class="alert-tip"
        >
          <template #default>
            <p>• 重放时会自动检查重复事件（相同租户+接口+毫秒时间戳）</p>
            <p>• 重放完成后会自动触发局部对账验证数据一致性</p>
            <p>• 重放进度将通过WebSocket实时推送</p>
          </template>
        </el-alert>
      </div>
      <template #footer>
        <el-button @click="replayDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitReplay" :loading="replaying">
          确认{{ isDryRun ? '预览' : '重放' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="progressDialogVisible" title="重放进度" width="600px" :close-on-click-modal="false">
      <div class="progress-content">
        <div class="progress-header">
          <span>任务ID: {{ currentJobId }}</span>
          <el-tag :type="progressStatus === 'completed' ? 'success' : 'warning'">
            {{ progressStatus === 'completed' ? '已完成' : '处理中' }}
          </el-tag>
        </div>
        
        <el-progress
          :percentage="currentProgress"
          :status="progressStatus === 'failed' ? 'exception' : ''"
          :stroke-width="20"
        />
        
        <el-row :gutter="20" class="progress-stats">
          <el-col :span="6">
            <el-statistic title="总计" :value="progressData.total || 0" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="成功" :value="progressData.success || 0" value-style="color: #67C23A" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="跳过" :value="progressData.skipped || 0" value-style="color: #E6A23C" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="失败" :value="progressData.failed || 0" value-style="color: #F56C6C" />
          </el-col>
        </el-row>

        <div v-if="progressData.completed" class="completed-result">
          <el-alert
            :title="`重放完成：成功 ${progressData.success} 条，跳过 ${progressData.skipped} 条，失败 ${progressData.failed} 条`"
            :type="progressData.failed > 0 ? 'warning' : 'success'"
            :closable="false"
          />
          <div v-if="progressData.triggeredReconciliation" class="reconciliation-notice">
            <el-icon><InfoFilled /></el-icon>
            已自动触发局部对账任务验证数据一致性
          </div>
        </div>
      </div>
      <template #footer>
        <el-button v-if="progressData.completed" type="primary" @click="closeProgressDialog">
          关闭
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dryRunDialogVisible" title="Dry-Run结果报告" width="800px">
      <div v-if="dryRunResult" class="dryrun-result">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="总计事件">
            <strong>{{ dryRunResult.total }}</strong> 条
          </el-descriptions-item>
          <el-descriptions-item label="将重放">
            <strong style="color: #67C23A">{{ dryRunResult.toReplay?.length || 0 }}</strong> 条
          </el-descriptions-item>
          <el-descriptions-item label="将跳过">
            <strong style="color: #E6A23C">{{ dryRunResult.toSkip?.length || 0 }}</strong> 条
          </el-descriptions-item>
          <el-descriptions-item label="预计影响聚合数">
            <strong>{{ dryRunResult.willUpdateAggregations?.length || 0 }}</strong> 条
          </el-descriptions-item>
        </el-descriptions>

        <div class="estimates-section">
          <h4>预计数据变化</h4>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-statistic title="调用次数" :value="dryRunResult.estimatedChanges?.callCount || 0" />
            </el-col>
            <el-col :span="8">
              <el-statistic title="数据传输(MB)" :value="dryRunResult.estimatedChanges?.dataTransferMB || 0" :precision="2" />
            </el-col>
            <el-col :span="8">
              <el-statistic title="计算时长(s)" :value="dryRunResult.estimatedChanges?.computeSeconds || 0" :precision="2" />
            </el-col>
          </el-row>
        </div>

        <div class="detail-section">
          <el-tabs v-model="dryRunActiveTab">
            <el-tab-pane label="将重放的事件" name="replay">
              <el-table :data="dryRunResult.toReplay || []" max-height="250" border size="small">
                <el-table-column prop="timestamp" label="事件时间" width="180">
                  <template #default="{ row }">{{ formatDateTime(row.timestamp) }}</template>
                </el-table-column>
                <el-table-column prop="originalMonth" label="原归属月" width="110" />
                <el-table-column prop="correctMonth" label="正确归属月" width="110">
                  <template #default="{ row }">
                    <el-tag v-if="row.originalMonth !== row.correctMonth" type="warning">
                      {{ row.correctMonth }}
                    </el-tag>
                    <span v-else>{{ row.correctMonth }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="callCount" label="调用" width="80" />
                <el-table-column prop="dataTransferMB" label="流量(MB)" width="100" :precision="2" />
                <el-table-column prop="computeSeconds" label="时长(s)" width="100" :precision="2" />
              </el-table>
            </el-tab-pane>
            <el-tab-pane label="将跳过的事件" name="skip">
              <el-table :data="dryRunResult.toSkip || []" max-height="250" border size="small">
                <el-table-column prop="timestamp" label="事件时间" width="180">
                  <template #default="{ row }">{{ formatDateTime(row.timestamp) }}</template>
                </el-table-column>
                <el-table-column prop="reason" label="跳过原因" />
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
      <template #footer>
        <el-button @click="dryRunDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="死信事件详情" width="700px">
      <div v-if="currentEvent" class="event-detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="事件ID">{{ currentEvent.id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTag(currentEvent.status)">
              {{ getStatusText(currentEvent.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="租户">
            {{ getTenantName(currentEvent.tenantId || currentEvent.eventData?.tenantId) }}
          </el-descriptions-item>
          <el-descriptions-item label="接口">
            {{ currentEvent.eventData?.apiName || currentEvent.eventData?.apiInterfaceId }}
          </el-descriptions-item>
          <el-descriptions-item label="事件时间">
            {{ formatDateTime(currentEvent.eventData?.timestamp) }}
          </el-descriptions-item>
          <el-descriptions-item label="归属月份">{{ currentEvent.month }}</el-descriptions-item>
          <el-descriptions-item label="重试次数">{{ currentEvent.retryCount }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDateTime(currentEvent.createdAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-section">
          <h4>事件数据</h4>
          <pre class="json-preview">{{ JSON.stringify(currentEvent.eventData, null, 2) }}</pre>
        </div>

        <div class="detail-section">
          <h4>错误信息</h4>
          <el-alert :title="currentEvent.errorMessage" type="error" :closable="false" />
          <div v-if="currentEvent.errorStack" class="error-stack">
            <el-collapse>
              <el-collapse-item title="查看错误堆栈" name="stack">
                <pre>{{ currentEvent.errorStack }}</pre>
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, VideoPlay, View, InfoFilled } from '@element-plus/icons-vue';
import { reconciliationApi, tenantApi } from '../../api';
import dayjs from 'dayjs';

const loading = ref(false);
const replaying = ref(false);
const eventList = ref([]);
const tenantList = ref([]);
const selectedEvents = ref([]);
const currentEvent = ref(null);

const replayDialogVisible = ref(false);
const progressDialogVisible = ref(false);
const dryRunDialogVisible = ref(false);
const detailDialogVisible = ref(false);

const isDryRun = ref(false);
const dryRunActiveTab = ref('replay');
const dryRunResult = ref(null);

const currentJobId = ref('');
const currentProgress = ref(0);
const progressStatus = ref('running');
const progressData = reactive({
  total: 0,
  success: 0,
  skipped: 0,
  failed: 0,
  completed: false,
});

const filters = reactive({
  status: 'pending',
  tenantId: '',
  month: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

let progressPollTimer = null;
let wsConnection = null;

onMounted(() => {
  loadDeadLetters();
  loadTenants();
  initWebSocket();
});

onBeforeUnmount(() => {
  if (progressPollTimer) {
    clearInterval(progressPollTimer);
  }
  if (wsConnection) {
    wsConnection.close();
  }
});

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/replay`;
  
  try {
    wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onopen = () => {
      console.log('WebSocket connected successfully');
      if (currentJobId.value) {
        subscribeToJob(currentJobId.value);
      }
    };
    
    wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'progress' && message.jobId === currentJobId.value) {
          updateProgressData(message.data);
        } else if (message.type === 'completed' && message.jobId === currentJobId.value) {
          updateProgressData(message.data);
        } else if (message.type === 'connected') {
          console.log('WebSocket confirmed connection:', message.clientId);
          if (currentJobId.value) {
            subscribeToJob(currentJobId.value);
          }
        }
      } catch (e) {
        console.error('WebSocket message parse error:', e);
      }
    };
    
    wsConnection.onerror = (error) => {
      console.warn('WebSocket connection failed, falling back to polling:', error);
    };
    
    wsConnection.onclose = () => {
      console.log('WebSocket connection closed');
    };
  } catch (e) {
    console.warn('WebSocket init failed, falling back to polling:', e);
  }
}

function subscribeToJob(jobId) {
  if (wsConnection && wsConnection.readyState === 1) {
    wsConnection.send(JSON.stringify({
      type: 'subscribe',
      jobId,
    }));
    console.log('Subscribed to job:', jobId);
  }
}

async function loadTenants() {
  try {
    const res = await tenantApi.getList({ pageSize: 1000 });
    if (res.success) {
      tenantList.value = res.data;
    }
  } catch (e) {}
}

async function loadDeadLetters() {
  loading.value = true;
  try {
    const res = await reconciliationApi.getDeadLetters({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filters.status || undefined,
      tenantId: filters.tenantId || undefined,
      month: filters.month || undefined,
    });
    if (res.success) {
      eventList.value = res.data;
      pagination.total = res.total;
    }
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.status = 'pending';
  filters.tenantId = '';
  filters.month = '';
  pagination.page = 1;
  loadDeadLetters();
}

function handleSelectionChange(selection) {
  selectedEvents.value = selection;
}

function checkSelectable(row) {
  return row.status === 'pending' || row.status === 'failed';
}

function showReplayDialog(dryRun) {
  isDryRun.value = dryRun;
  replayDialogVisible.value = true;
}

function viewEventDetail(row) {
  currentEvent.value = row;
  detailDialogVisible.value = true;
}

async function submitReplay() {
  const deadLetterIds = selectedEvents.value.map(e => e.id);
  
  replaying.value = true;
  replayDialogVisible.value = false;
  
  try {
    const res = await reconciliationApi.replayEvents({
      deadLetterIds,
      dryRun: isDryRun.value,
      triggerReconciliation: true,
    });
    
    if (res.success) {
      if (isDryRun.value) {
        dryRunResult.value = res.data;
        dryRunDialogVisible.value = true;
      } else {
        currentJobId.value = res.data.jobId;
        startProgressTracking();
        ElMessage.success(res.message || '重放任务已提交');
      }
    }
  } finally {
    replaying.value = false;
  }
}

function startProgressTracking() {
  currentProgress.value = 0;
  progressStatus.value = 'running';
  Object.assign(progressData, {
    total: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    completed: false,
  });
  progressDialogVisible.value = true;
  
  subscribeToJob(currentJobId.value);
  pollProgress();
  progressPollTimer = setInterval(pollProgress, 2000);
}

async function pollProgress() {
  try {
    const res = await reconciliationApi.getReplayProgress(currentJobId.value);
    if (res.success) {
      updateProgressData(res.data);
    }
  } catch (e) {
    if (e.response?.status === 404) {
      progressStatus.value = 'completed';
      progressData.completed = true;
      stopProgressPolling();
    }
  }
}

function updateProgressData(data) {
  if (data.progress !== undefined) {
    currentProgress.value = data.progress;
  }
  if (data.total !== undefined) progressData.total = data.total;
  if (data.success !== undefined) progressData.success = data.success;
  if (data.skipped !== undefined) progressData.skipped = data.skipped;
  if (data.failed !== undefined) progressData.failed = data.failed;
  if (data.completed) {
    progressData.completed = true;
    progressStatus.value = data.failed > 0 ? 'failed' : 'completed';
    stopProgressPolling();
    loadDeadLetters();
  }
  if (data.triggeredReconciliation) {
    progressData.triggeredReconciliation = true;
  }
}

function stopProgressPolling() {
  if (progressPollTimer) {
    clearInterval(progressPollTimer);
    progressPollTimer = null;
  }
}

function closeProgressDialog() {
  progressDialogVisible.value = false;
  loadDeadLetters();
  selectedEvents.value = [];
}

function getTenantName(tenantId) {
  const tenant = tenantList.value.find(t => t.id === tenantId);
  return tenant ? `${tenant.name} (${tenant.code})` : tenantId || '-';
}

function getCorrectMonth(row) {
  if (row.eventData?.timestamp) {
    return dayjs(row.eventData.timestamp).format('YYYY-MM');
  }
  return row.month || '-';
}

function getMonthTag(row) {
  const correctMonth = getCorrectMonth(row);
  if (row.month && correctMonth !== row.month) {
    return 'warning';
  }
  return 'info';
}

function getStatusTag(status) {
  const map = {
    pending: 'warning',
    processing: 'info',
    reprocessed: 'success',
    failed: 'danger',
    ignored: 'info',
  };
  return map[status] || 'info';
}

function getStatusText(status) {
  const map = {
    pending: '待处理',
    processing: '处理中',
    reprocessed: '已重放',
    failed: '失败',
    ignored: '已忽略',
  };
  return map[status] || status;
}

function formatDateTime(date) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function truncateText(text, maxLength) {
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
</script>

<style scoped>
.replay-container {
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

.action-buttons {
  display: flex;
  gap: 12px;
}

.filter-form {
  margin: 0;
}

.event-data-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #606266;
}

.error-text {
  color: #F56C6C;
  font-size: 12px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.replay-confirm p {
  margin: 8px 0;
  font-size: 14px;
}

.alert-tip {
  margin-top: 16px;
}

.alert-tip p {
  margin: 4px 0;
  font-size: 12px;
}

.progress-content {
  padding: 10px 0;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  font-size: 13px;
  color: #606266;
}

.progress-stats {
  margin-top: 24px;
}

.completed-result {
  margin-top: 24px;
}

.reconciliation-notice {
  margin-top: 12px;
  padding: 10px;
  background: #ecf5ff;
  border-radius: 4px;
  color: #409EFF;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dryrun-result {
  padding: 10px 0;
}

.estimates-section,
.detail-section {
  margin-top: 24px;
}

.estimates-section h4,
.detail-section h4 {
  margin: 0 0 12px 0;
  padding-left: 10px;
  border-left: 3px solid #409EFF;
  color: #303133;
}

.event-detail {
  padding: 10px 0;
}

.detail-section {
  margin-top: 20px;
}

.detail-section h4 {
  margin: 20px 0 12px 0;
  padding-left: 10px;
  border-left: 3px solid #409EFF;
  color: #303133;
}

.json-preview {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  max-height: 300px;
  overflow: auto;
  font-size: 12px;
  color: #606266;
}

.error-stack {
  margin-top: 12px;
}

.error-stack pre {
  background: #fef0f0;
  padding: 12px;
  border-radius: 4px;
  max-height: 200px;
  overflow: auto;
  font-size: 11px;
  color: #F56C6C;
}
</style>
