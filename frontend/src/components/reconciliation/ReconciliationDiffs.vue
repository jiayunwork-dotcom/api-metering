<template>
  <div class="diffs-container">
    <div class="toolbar">
      <div class="action-buttons">
        <el-button
          type="primary"
          :disabled="selectedDiffs.length === 0"
          @click="showBatchResolveDialog('auto')"
        >
          <el-icon><MagicStick /></el-icon>
          批量自动修正
        </el-button>
        <el-button
          type="warning"
          :disabled="selectedDiffs.length === 0"
          @click="showBatchResolveDialog('ignore')"
        >
          <el-icon><Hide /></el-icon>
          批量忽略
        </el-button>
      </div>
      <el-form :inline="true" class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable style="width: 140px">
            <el-option label="待处理" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="已修正" value="resolved" />
            <el-option label="已忽略" value="ignored" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="严重程度">
          <el-select v-model="filters.severity" placeholder="全部" clearable style="width: 120px">
            <el-option label="严重(红)" value="critical" />
            <el-option label="警告(黄)" value="warning" />
            <el-option label="轻微(绿)" value="minor" />
          </el-select>
        </el-form-item>
        <el-form-item label="差异类型">
          <el-select v-model="filters.diffType" placeholder="全部" clearable style="width: 140px">
            <el-option label="配额偏差" value="quota_deviation" />
            <el-option label="聚合偏差" value="aggregation_deviation" />
            <el-option label="事件缺失" value="event_missing" />
            <el-option label="跨月归属错误" value="cross_month_misplacement" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="loadDiffs">
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
      :data="diffList"
      border
      stripe
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" :selectable="checkSelectable" />
      <el-table-column label="严重程度" width="110">
        <template #default="{ row }">
          <el-tag :type="getSeverityTag(row.severity)" effect="dark">
            {{ getSeverityText(row.severity) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="差异类型" width="140">
        <template #default="{ row }">
          {{ getDiffTypeText(row.diffType) }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusTag(row.status)">
            {{ getStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="租户" width="140">
        <template #default="{ row }">
          {{ row.Tenant?.name }}
        </template>
      </el-table-column>
      <el-table-column label="接口" width="140">
        <template #default="{ row }">
          {{ row.ApiInterface?.name }}
        </template>
      </el-table-column>
      <el-table-column prop="dateKey" label="日期" width="120" />
      <el-table-column prop="dimension" label="维度" width="100" />
      <el-table-column label="三方数据对比" min-width="300">
        <template #default="{ row }">
          <div class="compare-values">
            <div class="compare-item">
              <span class="label">事件:</span>
              <span class="value">{{ formatNumber(row.eventSumValue) }}</span>
            </div>
            <div class="compare-item">
              <span class="label">聚合:</span>
              <span class="value" :class="{ 'text-red': hasDiff(row.eventSumValue, row.dbAggregationValue) }">
                {{ formatNumber(row.dbAggregationValue) }}
              </span>
            </div>
            <div class="compare-item">
              <span class="label">配额:</span>
              <span class="value" :class="{ 'text-red': hasDiff(row.eventSumValue, row.redisQuotaValue) }">
                {{ formatNumber(row.redisQuotaValue) }}
              </span>
            </div>
            <div class="compare-item diff-item">
              <span class="label">差异:</span>
              <span class="value text-red">{{ formatNumber(row.diffAmount) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="diffPercent" label="差异%" width="100" align="right">
        <template #default="{ row }">
          <span class="text-red">{{ row.diffPercent?.toFixed(2) }}%</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="viewDiffDetail(row)">
            详情
          </el-button>
          <el-button
            v-if="row.status === 'pending'"
            type="success"
            link
            @click="showResolveDialog(row, 'auto')"
          >
            修正
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
        @size-change="loadDiffs"
        @current-change="loadDiffs"
      />
    </div>

    <el-dialog v-model="detailDialogVisible" title="差异详情" width="700px">
      <div v-if="currentDiff" class="diff-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="差异ID">{{ currentDiff.id }}</el-descriptions-item>
          <el-descriptions-item label="关联任务">{{ currentDiff.ReconciliationTask?.taskNo }}</el-descriptions-item>
          <el-descriptions-item label="差异类型">
            <el-tag :type="getSeverityTag(currentDiff.severity)">
              {{ getDiffTypeText(currentDiff.diffType) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="严重程度">
            <el-tag :type="getSeverityTag(currentDiff.severity)" effect="dark">
              {{ getSeverityText(currentDiff.severity) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTag(currentDiff.status)">
              {{ getStatusText(currentDiff.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="维度">{{ currentDiff.dimension }}</el-descriptions-item>
          <el-descriptions-item label="租户">{{ currentDiff.Tenant?.name }}</el-descriptions-item>
          <el-descriptions-item label="接口">{{ currentDiff.ApiInterface?.name }}</el-descriptions-item>
          <el-descriptions-item label="日期">{{ currentDiff.dateKey }}</el-descriptions-item>
          <el-descriptions-item label="归属月份">{{ currentDiff.month }}</el-descriptions-item>
          <el-descriptions-item label="差异量" :span="2">
            <span style="color: #F56C6C; font-size: 18px; font-weight: 600">
              {{ formatNumber(currentDiff.diffAmount) }} ({{ currentDiff.diffPercent?.toFixed(2) }}%)
            </span>
          </el-descriptions-item>
        </el-descriptions>

        <div class="compare-section">
          <h4>三方数据源对比</h4>
          <el-table :data="compareData" border size="small">
            <el-table-column prop="source" label="数据源" width="140" />
            <el-table-column prop="value" label="数值" align="right">
              <template #default="{ row }">
                <span :class="{ 'text-red': row.hasDiff }">
                  {{ formatNumber(row.value) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="diff" label="与事件差值" align="right">
              <template #default="{ row }">
                <span v-if="row.diff !== 0" class="text-red">
                  {{ row.diff > 0 ? '+' : '' }}{{ formatNumber(row.diff) }}
                </span>
                <span v-else style="color: #67C23A">0</span>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="说明" />
          </el-table>
        </div>

        <div v-if="currentDiff.status === 'pending'" class="action-section">
          <el-divider content-position="left">修正操作</el-divider>
          <el-radio-group v-model="resolveStrategy">
            <el-radio value="auto">自动修正（以原始事件为准）</el-radio>
            <el-radio value="manual">手动输入修正值</el-radio>
            <el-radio value="ignore">忽略（标记为已知偏差）</el-radio>
            <el-radio v-if="currentDiff.diffType === 'cross_month_misplacement'" value="migrate">
              迁移事件到正确月份
              <div class="migration-info" v-if="currentDiff.sourceMonth && currentDiff.targetMonth">
                从 {{ currentDiff.sourceMonth }} 迁移到 {{ currentDiff.targetMonth }}
                (涉及 {{ currentDiff.affectedEventCount }} 条事件)
              </div>
            </el-radio>
          </el-radio-group>
          <el-form v-if="resolveStrategy === 'manual'" class="manual-form">
            <el-form-item label="修正值" required>
              <el-input-number
                v-model="manualValue"
                :precision="currentDiff.dimension === 'count' ? 0 : 4"
                :step="currentDiff.dimension === 'count' ? 1 : 0.0001"
                :min="0"
                style="width: 200px"
              />
            </el-form-item>
          </el-form>
          <el-form class="reason-form">
            <el-form-item label="修正原因" required>
              <el-input
                v-model="resolveReason"
                type="textarea"
                :rows="3"
                placeholder="请输入修正原因"
                maxlength="500"
                show-word-limit
              />
            </el-form-item>
          </el-form>
          <div class="action-buttons">
            <el-button type="primary" @click="submitResolve" :loading="resolving">
              确认修正
            </el-button>
          </div>
        </div>

        <div v-else-if="currentDiff.status === 'resolved'" class="resolved-info">
          <el-alert
            :title="`已通过${getStrategyText(currentDiff.resolutionStrategy)}处理`"
            type="success"
            :closable="false"
          >
            <template #default>
              <p>处理人: {{ currentDiff.resolvedBy }}</p>
              <p>处理时间: {{ formatDateTime(currentDiff.resolvedAt) }}</p>
              <p>修正原因: {{ currentDiff.resolutionReason }}</p>
              <p v-if="currentDiff.beforeValues">
                修正前: 事件={{ formatNumber(currentDiff.beforeValues.eventSumValue) }},
                聚合={{ formatNumber(currentDiff.beforeValues.dbAggregationValue) }},
                配额={{ formatNumber(currentDiff.beforeValues.redisQuotaValue) }}
              </p>
              <p v-if="currentDiff.afterValues">
                修正后: 事件={{ formatNumber(currentDiff.afterValues.eventSumValue) }},
                聚合={{ formatNumber(currentDiff.afterValues.dbAggregationValue) }},
                配额={{ formatNumber(currentDiff.afterValues.redisQuotaValue) }}
              </p>
            </template>
          </el-alert>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="batchDialogVisible" title="批量修正确认" width="500px">
      <div class="batch-confirm">
        <p>您选择了 <strong style="color: #409EFF">{{ selectedDiffs.length }}</strong> 条差异记录，</p>
        <p>确定要执行 <strong>{{ getStrategyText(batchStrategy) }}</strong> 操作吗？</p>
        <el-form class="reason-form">
          <el-form-item label="修正原因" required>
            <el-input
              v-model="batchReason"
              type="textarea"
              :rows="3"
              placeholder="请输入修正原因"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitBatchResolve" :loading="resolving">
          确认
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, MagicStick, Hide } from '@element-plus/icons-vue';
import { reconciliationApi } from '../../api';
import dayjs from 'dayjs';

const loading = ref(false);
const resolving = ref(false);
const diffList = ref([]);
const currentDiff = ref(null);
const selectedDiffs = ref([]);
const detailDialogVisible = ref(false);
const batchDialogVisible = ref(false);

const filters = reactive({
  status: 'pending',
  severity: '',
  diffType: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const resolveStrategy = ref('auto');
const manualValue = ref(0);
const resolveReason = ref('');
const batchStrategy = ref('auto');
const batchReason = ref('');

const compareData = computed(() => {
  if (!currentDiff.value) return [];
  const eventValue = Number(currentDiff.value.eventSumValue) || 0;
  return [
    {
      source: '原始事件表',
      value: eventValue,
      diff: 0,
      hasDiff: false,
      description: 'SUM统计，作为金标准',
    },
    {
      source: '聚合表',
      value: Number(currentDiff.value.dbAggregationValue) || 0,
      diff: (Number(currentDiff.value.dbAggregationValue) || 0) - eventValue,
      hasDiff: Math.abs((Number(currentDiff.value.dbAggregationValue) || 0) - eventValue) > 0.0001,
      description: 'PostgreSQL中的用量聚合数据',
    },
    {
      source: 'Redis配额',
      value: Number(currentDiff.value.redisQuotaValue) || 0,
      diff: (Number(currentDiff.value.redisQuotaValue) || 0) - eventValue,
      hasDiff: Math.abs((Number(currentDiff.value.redisQuotaValue) || 0) - eventValue) > 0.0001,
      description: 'Redis中的实时配额计数',
    },
  ];
});

onMounted(() => {
  loadDiffs();
});

async function loadDiffs() {
  loading.value = true;
  try {
    const res = await reconciliationApi.getDiffs({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filters.status || undefined,
      severity: filters.severity || undefined,
      diffType: filters.diffType || undefined,
    });
    if (res.success) {
      diffList.value = res.data;
      pagination.total = res.total;
    }
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.status = 'pending';
  filters.severity = '';
  filters.diffType = '';
  pagination.page = 1;
  loadDiffs();
}

function handleSelectionChange(selection) {
  selectedDiffs.value = selection;
}

function checkSelectable(row) {
  return row.status === 'pending';
}

function viewDiffDetail(row) {
  currentDiff.value = row;
  resolveStrategy.value = 'auto';
  manualValue.value = Number(row.expectedValue) || 0;
  resolveReason.value = '';
  detailDialogVisible.value = true;
}

function showResolveDialog(row, strategy) {
  viewDiffDetail(row);
  resolveStrategy.value = strategy;
}

function showBatchResolveDialog(strategy) {
  batchStrategy.value = strategy;
  batchReason.value = '';
  batchDialogVisible.value = true;
}

async function submitResolve() {
  if (!resolveReason.value.trim()) {
    ElMessage.warning('请输入修正原因');
    return;
  }

  resolving.value = true;
  try {
    const res = await reconciliationApi.resolveDiff(currentDiff.value.id, {
      strategy: resolveStrategy.value,
      reason: resolveReason.value,
      manualValue: resolveStrategy.value === 'manual' ? manualValue.value : undefined,
    });
    if (res.success) {
      if (res.data.alreadyResolved) {
        ElMessage.warning(res.data.message);
      } else {
        ElMessage.success(res.data.message || '修正成功');
      }
      detailDialogVisible.value = false;
      loadDiffs();
    }
  } finally {
    resolving.value = false;
  }
}

async function submitBatchResolve() {
  if (!batchReason.value.trim()) {
    ElMessage.warning('请输入修正原因');
    return;
  }

  resolving.value = true;
  try {
    const res = await reconciliationApi.batchResolveDiffs({
      diffIds: selectedDiffs.value.map(d => d.id),
      strategy: batchStrategy.value,
      reason: batchReason.value,
    });
    if (res.success) {
      ElMessage.success(res.data.message);
      batchDialogVisible.value = false;
      selectedDiffs.value = [];
      loadDiffs();
    }
  } finally {
    resolving.value = false;
  }
}

function hasDiff(val1, val2) {
  return Math.abs(Number(val1 || 0) - Number(val2 || 0)) > 0.0001;
}

function formatNumber(val) {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  if (Math.abs(num) >= 1000) {
    return num.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  }
  return num.toFixed(Math.abs(num) >= 1 ? 2 : 4);
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

function getStatusTag(status) {
  const map = {
    pending: 'warning',
    processing: 'info',
    resolved: 'success',
    ignored: 'info',
    failed: 'danger',
  };
  return map[status] || 'info';
}

function getStatusText(status) {
  const map = {
    pending: '待处理',
    processing: '处理中',
    resolved: '已修正',
    ignored: '已忽略',
    failed: '失败',
  };
  return map[status] || status;
}

function getStrategyText(strategy) {
  const map = {
    auto: '自动修正',
    manual: '手动修正',
    ignore: '忽略',
    migrate: '跨月迁移',
  };
  return map[strategy] || strategy;
}

function formatDateTime(date) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-';
}
</script>

<style scoped>
.diffs-container {
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

.compare-values {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
}

.compare-item {
  display: flex;
  gap: 4px;
}

.compare-item .label {
  color: #909399;
}

.compare-item .value {
  font-family: monospace;
  font-weight: 500;
}

.text-red {
  color: #F56C6C;
}

.compare-item.diff-item .value {
  font-weight: 600;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.diff-detail {
  padding: 10px 0;
}

.compare-section {
  margin-top: 24px;
}

.compare-section h4,
.action-section h4 {
  margin: 20px 0 12px 0;
  padding-left: 10px;
  border-left: 3px solid #409EFF;
  color: #303133;
}

.manual-form,
.reason-form {
  margin-top: 16px;
}

.action-buttons {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.resolved-info {
  margin-top: 24px;
}

.resolved-info p {
  margin: 4px 0;
  color: #606266;
}

.batch-confirm {
  padding: 10px 0;
}

.batch-confirm p {
  margin: 8px 0;
  font-size: 14px;
}

.migration-info {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
  padding-left: 20px;
}
</style>
