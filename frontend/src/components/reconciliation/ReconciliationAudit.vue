<template>
  <div class="audit-container">
    <div class="toolbar">
      <el-form :inline="true" class="filter-form">
        <el-form-item label="操作人">
          <el-input
            v-model="filters.operator"
            placeholder="请输入操作人"
            clearable
            style="width: 160px"
            @keyup.enter="loadAuditLogs"
          />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="filters.operationType" placeholder="全部" clearable style="width: 180px">
            <el-option
              v-for="item in operationTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 280px"
          />
        </el-form-item>
        <el-form-item>
          <el-button @click="loadAuditLogs">
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

    <div class="timeline-container">
      <el-table
        v-loading="loading"
        :data="logList"
        border
        stripe
        :row-class-name="getRowClassName"
      >
        <el-table-column label="时间" width="180" fixed="left">
          <template #default="{ row }">
            <div class="time-cell">
              <el-icon class="timeline-icon" :color="getTypeColor(row.operationType)">
                <component :is="getTypeIcon(row.operationType)" />
              </el-icon>
              <span class="time-text">{{ formatDateTime(row.operatedAt) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作类型" width="140">
          <template #default="{ row }">
            <el-tag :type="getTypeTag(row.operationType)" effect="dark">
              {{ getOperationTypeText(row.operationType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTag(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作人" width="120">
          <template #default="{ row }">
            <el-avatar :size="24" style="vertical-align: middle; margin-right: 6px">
              {{ row.operator?.charAt(0)?.toUpperCase() }}
            </el-avatar>
            {{ row.operator }}
          </template>
        </el-table-column>
        <el-table-column label="操作描述" min-width="200">
          <template #default="{ row }">
            <div class="operation-desc">
              {{ getOperationDescription(row) }}
              <span v-if="row.affectedCount > 0" class="affected-badge">
                影响 {{ row.affectedCount }} 条
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="原因" min-width="180">
          <template #default="{ row }">
            <el-tooltip :content="row.reason" placement="top" v-if="row.reason">
              <span class="reason-text">{{ truncateText(row.reason, 40) }}</span>
            </el-tooltip>
            <span v-else class="text-gray">-</span>
          </template>
        </el-table-column>
        <el-table-column label="关联信息" width="200">
          <template #default="{ row }">
            <div class="relation-info">
              <div v-if="row.taskId" class="relation-item">
                <span class="label">对账任务:</span>
                <el-link type="primary" :underline="false" @click="viewTask(row.taskId)">
                  {{ truncateText(row.taskId, 8) }}
                </el-link>
              </div>
              <div v-if="row.diffId" class="relation-item">
                <span class="label">差异记录:</span>
                <el-link type="primary" :underline="false" @click="viewDiff(row.diffId)">
                  {{ truncateText(row.diffId, 8) }}
                </el-link>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewLogDetail(row)">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[20, 50, 100, 200]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadAuditLogs"
        @current-change="loadAuditLogs"
      />
    </div>

    <el-dialog v-model="detailDialogVisible" title="操作详情" width="700px">
      <div v-if="currentLog" class="log-detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="操作ID">{{ currentLog.id }}</el-descriptions-item>
          <el-descriptions-item label="操作类型">
            <el-tag :type="getTypeTag(currentLog.operationType)" effect="dark">
              {{ getOperationTypeText(currentLog.operationType) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTag(currentLog.status)">
              {{ getStatusText(currentLog.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="操作人">{{ currentLog.operator }}</el-descriptions-item>
          <el-descriptions-item label="操作时间" :span="2">
            {{ formatDateTime(currentLog.operatedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="影响记录数" v-if="currentLog.affectedCount !== undefined">
            {{ currentLog.affectedCount }} 条
          </el-descriptions-item>
          <el-descriptions-item label="对账任务" v-if="currentLog.taskId">
            <el-link type="primary" @click="viewTask(currentLog.taskId)">
              查看任务
            </el-link>
          </el-descriptions-item>
          <el-descriptions-item label="差异记录" v-if="currentLog.diffId">
            <el-link type="primary" @click="viewDiff(currentLog.diffId)">
              查看差异
            </el-link>
          </el-descriptions-item>
          <el-descriptions-item label="操作原因" :span="2" v-if="currentLog.reason">
            {{ currentLog.reason }}
          </el-descriptions-item>
          <el-descriptions-item label="错误信息" :span="2" v-if="currentLog.errorMessage">
            <span style="color: #F56C6C">{{ currentLog.errorMessage }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="currentLog.beforeValues || currentLog.afterValues" class="compare-section">
          <h4>数据变更对比</h4>
          <div class="compare-tables">
            <div class="compare-table-wrapper" v-if="currentLog.beforeValues">
              <h5>操作前</h5>
              <el-table :data="formatValues(currentLog.beforeValues)" border size="small">
                <el-table-column prop="key" label="字段" width="140" />
                <el-table-column prop="value" label="数值" />
              </el-table>
            </div>
            <div class="compare-table-wrapper" v-if="currentLog.afterValues">
              <h5>操作后</h5>
              <el-table :data="formatValues(currentLog.afterValues)" border size="small">
                <el-table-column prop="key" label="字段" width="140" />
                <el-table-column prop="value" label="数值" />
              </el-table>
            </div>
          </div>
        </div>

        <div v-if="currentLog.metadata" class="metadata-section">
          <h4>元数据</h4>
          <pre class="json-preview">{{ JSON.stringify(currentLog.metadata, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, markRaw } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Search,
  Refresh,
  VideoPlay,
  View,
  MagicStick,
  Hide,
  Switch,
  List,
  Clock,
  Edit,
} from '@element-plus/icons-vue';
import { reconciliationApi } from '../../api';
import dayjs from 'dayjs';

const emit = defineEmits(['navigate']);

const loading = ref(false);
const logList = ref([]);
const currentLog = ref(null);
const detailDialogVisible = ref(false);

const filters = reactive({
  operator: '',
  operationType: '',
  dateRange: [],
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const operationTypeOptions = [
  { value: 'reconciliation_trigger', label: '对账任务触发' },
  { value: 'diff_auto_fix', label: '差异自动修正' },
  { value: 'diff_manual_fix', label: '差异手动修正' },
  { value: 'diff_ignore', label: '差异忽略' },
  { value: 'diff_migrate', label: '跨月迁移' },
  { value: 'event_replay', label: '事件重放' },
  { value: 'event_replay_dryrun', label: '事件重放Dry-Run' },
];

onMounted(() => {
  loadAuditLogs();
});

async function loadAuditLogs() {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      operator: filters.operator || undefined,
      operationType: filters.operationType || undefined,
    };
    
    if (filters.dateRange && filters.dateRange.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }
    
    const res = await reconciliationApi.getAuditLogs(params);
    if (res.success) {
      logList.value = res.data;
      pagination.total = res.total;
    }
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.operator = '';
  filters.operationType = '';
  filters.dateRange = [];
  pagination.page = 1;
  loadAuditLogs();
}

function viewLogDetail(row) {
  currentLog.value = row;
  detailDialogVisible.value = true;
}

function viewTask(taskId) {
  emit('navigate', 'tasks', taskId);
}

function viewDiff(diffId) {
  emit('navigate', 'diffs', diffId);
}

function getRowClassName({ rowIndex }) {
  return rowIndex % 2 === 0 ? 'even-row' : 'odd-row';
}

function getTypeColor(operationType) {
  const map = {
    reconciliation_trigger: '#409EFF',
    diff_auto_fix: '#67C23A',
    diff_manual_fix: '#E6A23C',
    diff_ignore: '#909399',
    diff_migrate: '#909399',
    event_replay: '#67C23A',
    event_replay_dryrun: '#E6A23C',
  };
  return map[operationType] || '#909399';
}

function getTypeIcon(operationType) {
  const map = {
    reconciliation_trigger: markRaw(Clock),
    diff_auto_fix: markRaw(MagicStick),
    diff_manual_fix: markRaw(Edit),
    diff_ignore: markRaw(Hide),
    diff_migrate: markRaw(Switch),
    event_replay: markRaw(VideoPlay),
    event_replay_dryrun: markRaw(View),
  };
  return map[operationType] || markRaw(List);
}

function getTypeTag(operationType) {
  const map = {
    reconciliation_trigger: 'primary',
    diff_auto_fix: 'success',
    diff_manual_fix: 'warning',
    diff_ignore: 'info',
    diff_migrate: 'info',
    event_replay: 'success',
    event_replay_dryrun: 'warning',
  };
  return map[operationType] || 'info';
}

function getOperationTypeText(type) {
  const map = {
    reconciliation_trigger: '对账任务触发',
    diff_auto_fix: '差异自动修正',
    diff_manual_fix: '差异手动修正',
    diff_ignore: '差异忽略',
    diff_migrate: '跨月迁移',
    event_replay: '事件重放',
    event_replay_dryrun: 'Dry-Run预览',
  };
  return map[type] || type;
}

function getStatusTag(status) {
  const map = {
    success: 'success',
    failed: 'danger',
    partial: 'warning',
  };
  return map[status] || 'info';
}

function getStatusText(status) {
  const map = {
    success: '成功',
    failed: '失败',
    partial: '部分成功',
  };
  return map[status] || status;
}

function getOperationDescription(row) {
  const type = row.operationType;
  const operator = row.operator;
  
  switch (type) {
    case 'reconciliation_trigger':
      return `${operator} 触发了对账任务`;
    case 'diff_auto_fix':
      return `${operator} 自动修正了数据差异`;
    case 'diff_manual_fix':
      return `${operator} 手动修正了数据差异`;
    case 'diff_ignore':
      return `${operator} 标记差异为已忽略`;
    case 'diff_migrate':
      return `${operator} 执行了跨月数据迁移`;
    case 'event_replay':
      return `${operator} 重放了死信事件`;
    case 'event_replay_dryrun':
      return `${operator} 执行了Dry-Run预览`;
    default:
      return `${operator} 执行了 ${type} 操作`;
  }
}

function formatValues(values) {
  if (!values) return [];
  const keyMap = {
    eventSumValue: '事件统计值',
    dbAggregationValue: '聚合表数值',
    redisQuotaValue: 'Redis配额值',
    callCount: '调用次数',
    dataTransferMB: '数据传输(MB)',
    computeSeconds: '计算时长(s)',
  };
  
  return Object.entries(values).map(([key, value]) => ({
    key: keyMap[key] || key,
    value: formatNumber(value),
  }));
}

function formatNumber(val) {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  if (Math.abs(num) >= 1000) {
    return num.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  }
  return num.toFixed(Math.abs(num) >= 1 ? 2 : 4);
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
.audit-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  margin-bottom: 16px;
}

.filter-form {
  margin: 0;
}

.timeline-container {
  flex: 1;
  overflow: auto;
}

.time-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-icon {
  font-size: 16px;
}

.time-text {
  font-family: monospace;
  font-size: 12px;
  color: #606266;
}

.operation-desc {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.affected-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #ecf5ff;
  color: #409EFF;
  border-radius: 10px;
  font-size: 12px;
}

.reason-text {
  color: #606266;
  font-size: 13px;
}

.text-gray {
  color: #C0C4CC;
}

.relation-info {
  font-size: 12px;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}

.relation-item .label {
  color: #909399;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.log-detail {
  padding: 10px 0;
}

.compare-section,
.metadata-section {
  margin-top: 24px;
}

.compare-section h4,
.metadata-section h4 {
  margin: 20px 0 12px 0;
  padding-left: 10px;
  border-left: 3px solid #409EFF;
  color: #303133;
}

.compare-tables {
  display: flex;
  gap: 20px;
}

.compare-table-wrapper {
  flex: 1;
}

.compare-table-wrapper h5 {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #606266;
  font-weight: 500;
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

:deep(.even-row) {
  background: #fafafa;
}

:deep(.odd-row) {
  background: #ffffff;
}
</style>
