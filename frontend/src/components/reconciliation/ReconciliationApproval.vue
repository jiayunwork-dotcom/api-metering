<template>
  <div class="approval-container">
    <el-tabs v-model="activeSubTab" class="approval-tabs">
      <el-tab-pane label="待我审批" name="pending">
        <div class="tab-content">
          <div class="toolbar">
            <div class="action-buttons">
              <el-button @click="loadPendingApprovals">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </div>

          <el-table
            v-loading="pendingLoading"
            :data="pendingApprovals"
            border
            stripe
          >
            <el-table-column prop="submissionNo" label="申请编号" width="180" />
            <el-table-column label="提交人" width="120">
              <template #default="{ row }">
                {{ row.submitterUser?.name || row.submitter }}
              </template>
            </el-table-column>
            <el-table-column prop="submittedAt" label="提交时间" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.submittedAt) }}
              </template>
            </el-table-column>
            <el-table-column label="审批级别" width="100">
              <template #default="{ row }">
                <el-tag :type="getApprovalLevelTag(row.approvalLevel)">
                  {{ getApprovalLevelText(row.approvalLevel) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="差异金额" width="120" align="right">
              <template #default="{ row }">
                <span :class="{ 'text-red': Number(row.diffAmountMoney) >= 100 }">
                  ¥{{ Number(row.diffAmountMoney).toFixed(2) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="修正策略" width="100">
              <template #default="{ row }">
                {{ getStrategyText(row.strategy) }}
              </template>
            </el-table-column>
            <el-table-column label="一级审批" width="120">
              <template #default="{ row }">
                <el-tag v-if="row.approver1Status" :type="row.approver1Status === 'approved' ? 'success' : 'danger'">
                  {{ row.approver1Status === 'approved' ? '已通过' : '已拒绝' }}
                </el-tag>
                <span v-else style="color: #909399">待审批</span>
              </template>
            </el-table-column>
            <el-table-column label="二级审批" width="120">
              <template #default="{ row }">
                <template v-if="row.approvalLevel === 'level2'">
                  <el-tag v-if="row.approver2Status" :type="row.approver2Status === 'approved' ? 'success' : 'danger'">
                    {{ row.approver2Status === 'approved' ? '已通过' : '已拒绝' }}
                  </el-tag>
                  <span v-else style="color: #909399">待审批</span>
                </template>
                <span v-else style="color: #c0c4cc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="viewApprovalDetail(row)">
                  审批
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination">
            <el-pagination
              v-model:current-page="pendingPagination.page"
              v-model:page-size="pendingPagination.pageSize"
              :total="pendingPagination.total"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="loadPendingApprovals"
              @current-change="loadPendingApprovals"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="我提交的" name="my">
        <div class="tab-content">
          <div class="toolbar">
            <div class="action-buttons">
              <el-button @click="loadMyApprovals">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </div>

          <el-table
            v-loading="myLoading"
            :data="myApprovals"
            border
            stripe
          >
            <el-table-column prop="submissionNo" label="申请编号" width="180" />
            <el-table-column prop="submittedAt" label="提交时间" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.submittedAt) }}
              </template>
            </el-table-column>
            <el-table-column label="审批级别" width="100">
              <template #default="{ row }">
                <el-tag :type="getApprovalLevelTag(row.approvalLevel)">
                  {{ getApprovalLevelText(row.approvalLevel) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="差异金额" width="120" align="right">
              <template #default="{ row }">
                <span :class="{ 'text-red': Number(row.diffAmountMoney) >= 100 }">
                  ¥{{ Number(row.diffAmountMoney).toFixed(2) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="修正策略" width="100">
              <template #default="{ row }">
                {{ getStrategyText(row.strategy) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusTag(row.status)">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="一级审批人" width="120">
              <template #default="{ row }">
                {{ row.approver1User?.name || row.approver1 || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="二级审批人" width="120">
              <template #default="{ row }">
                {{ row.approvalLevel === 'level2' ? (row.approver2User?.name || row.approver2 || '-') : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="viewApprovalDetail(row)">
                  详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination">
            <el-pagination
              v-model:current-page="myPagination.page"
              v-model:page-size="myPagination.pageSize"
              :total="myPagination.total"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="loadMyApprovals"
              @current-change="loadMyApprovals"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="detailDialogVisible"
      title="审批详情"
      width="900px"
      :close-on-click-modal="false"
    >
      <div v-if="currentApproval" class="approval-detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="申请编号">{{ currentApproval.submissionNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTag(currentApproval.status)">
              {{ getStatusText(currentApproval.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="提交人">
            {{ currentApproval.submitterUser?.name || currentApproval.submitter }}
          </el-descriptions-item>
          <el-descriptions-item label="提交时间">
            {{ formatDateTime(currentApproval.submittedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="审批级别">
            <el-tag :type="getApprovalLevelTag(currentApproval.approvalLevel)">
              {{ getApprovalLevelText(currentApproval.approvalLevel) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="差异金额">
            <span :class="{ 'text-red': Number(currentApproval.diffAmountMoney) >= 100 }">
              ¥{{ Number(currentApproval.diffAmountMoney).toFixed(2) }}
            </span>
            <span style="color: #909399; margin-left: 8px">
              (单价: ¥{{ Number(currentApproval.unitPrice || 0).toFixed(6) }})
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="修正策略">{{ getStrategyText(currentApproval.strategy) }}</el-descriptions-item>
          <el-descriptions-item label="差异量">{{ formatNumber(currentApproval.diffAmount) }}</el-descriptions-item>
          <el-descriptions-item label="修正原因" :span="2">{{ currentApproval.reason }}</el-descriptions-item>
          <el-descriptions-item v-if="currentApproval.strategy === 'manual'" label="手动修正值">
            {{ formatNumber(currentApproval.manualValue) }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="currentApproval.ReconciliationDiff" class="diff-section">
          <h4>关联差异信息</h4>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="差异类型">
              {{ getDiffTypeText(currentApproval.ReconciliationDiff.diffType) }}
            </el-descriptions-item>
            <el-descriptions-item label="严重程度">
              <el-tag :type="getSeverityTag(currentApproval.ReconciliationDiff.severity)" effect="dark">
                {{ getSeverityText(currentApproval.ReconciliationDiff.severity) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="日期">{{ currentApproval.ReconciliationDiff.dateKey }}</el-descriptions-item>
            <el-descriptions-item label="维度">{{ currentApproval.ReconciliationDiff.dimension }}</el-descriptions-item>
          </el-descriptions>

          <div class="compare-section">
            <h4>三方数据对比</h4>
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
        </div>

        <div class="approval-history">
          <h4>审批记录</h4>
          <el-steps direction="vertical" :active="getApprovalStep()">
            <el-step title="提交申请" :description="formatDateTime(currentApproval.submittedAt)">
              <template #icon>
                <el-icon :size="20" color="#409EFF"><Edit /></el-icon>
              </template>
              <div class="step-content">
                <p><strong>提交人:</strong> {{ currentApproval.submitterUser?.name || currentApproval.submitter }}</p>
                <p><strong>修正原因:</strong> {{ currentApproval.reason }}</p>
              </div>
            </el-step>
            <el-step
              v-if="currentApproval.approvalLevel !== 'auto'"
              :title="currentApproval.approvalLevel === 'level2' ? '一级审批' : '审批'"
              :status="getStepStatus(currentApproval.approver1Status)"
            >
              <template #icon>
                <el-icon :size="20" :color="getStepIconColor(currentApproval.approver1Status)"><User /></el-icon>
              </template>
              <div v-if="currentApproval.approver1" class="step-content">
                <p><strong>审批人:</strong> {{ currentApproval.approver1User?.name || currentApproval.approver1 }}</p>
                <p><strong>审批时间:</strong> {{ formatDateTime(currentApproval.approver1At) }}</p>
                <p><strong>审批意见:</strong> {{ currentApproval.approver1Opinion || '-' }}</p>
                <p>
                  <strong>审批结果:</strong>
                  <el-tag :type="currentApproval.approver1Status === 'approved' ? 'success' : 'danger'">
                    {{ currentApproval.approver1Status === 'approved' ? '通过' : '拒绝' }}
                  </el-tag>
                </p>
              </div>
              <div v-else class="step-content">
                <p style="color: #909399">等待审批...</p>
              </div>
            </el-step>
            <el-step
              v-if="currentApproval.approvalLevel === 'level2'"
              title="二级审批"
              :status="getStepStatus(currentApproval.approver2Status)"
            >
              <template #icon>
                <el-icon :size="20" :color="getStepIconColor(currentApproval.approver2Status)"><UserFilled /></el-icon>
              </template>
              <div v-if="currentApproval.approver2" class="step-content">
                <p><strong>审批人:</strong> {{ currentApproval.approver2User?.name || currentApproval.approver2 }}</p>
                <p><strong>审批时间:</strong> {{ formatDateTime(currentApproval.approver2At) }}</p>
                <p><strong>审批意见:</strong> {{ currentApproval.approver2Opinion || '-' }}</p>
                <p>
                  <strong>审批结果:</strong>
                  <el-tag :type="currentApproval.approver2Status === 'approved' ? 'success' : 'danger'">
                    {{ currentApproval.approver2Status === 'approved' ? '通过' : '拒绝' }}
                  </el-tag>
                </p>
              </div>
              <div v-else class="step-content">
                <p style="color: #909399">等待审批...</p>
              </div>
            </el-step>
            <el-step
              v-if="currentApproval.status === 'executed' || currentApproval.status === 'failed'"
              title="执行修正"
              :status="currentApproval.status === 'executed' ? 'success' : 'error'"
            >
              <template #icon>
                <el-icon :size="20" :color="currentApproval.status === 'executed' ? '#67C23A' : '#F56C6C'"><Check /></el-icon>
              </template>
              <div class="step-content">
                <p><strong>执行时间:</strong> {{ formatDateTime(currentApproval.executedAt) }}</p>
                <p v-if="currentApproval.errorMessage"><strong>错误信息:</strong> {{ currentApproval.errorMessage }}</p>
              </div>
            </el-step>
          </el-steps>
        </div>

        <div v-if="canApprove()" class="action-section">
          <el-divider content-position="left">审批操作</el-divider>
          <el-form class="opinion-form">
            <el-form-item label="审批意见">
              <el-input
                v-model="approvalOpinion"
                type="textarea"
                :rows="3"
                placeholder="请输入审批意见（拒绝时必填）"
                maxlength="500"
                show-word-limit
              />
            </el-form-item>
          </el-form>
          <div class="action-buttons">
            <el-button type="success" @click="approve" :loading="processing">
              <el-icon><Check /></el-icon>
              通过
            </el-button>
            <el-button type="danger" @click="showRejectDialog" :loading="processing">
              <el-icon><Close /></el-icon>
              拒绝
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="rejectDialogVisible" title="拒绝审批" width="500px">
      <el-form>
        <el-form-item label="拒绝原因" required>
          <el-input
            v-model="rejectReason"
            type="textarea"
            :rows="4"
            placeholder="请填写拒绝原因"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="reject" :loading="processing">确认拒绝</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Refresh, Edit, User, UserFilled, Check, Close,
} from '@element-plus/icons-vue';
import { reconciliationApi } from '../../api';
import dayjs from 'dayjs';

const emit = defineEmits(['navigate']);

const activeSubTab = ref('pending');
const detailDialogVisible = ref(false);
const rejectDialogVisible = ref(false);
const currentApproval = ref(null);
const approvalOpinion = ref('');
const rejectReason = ref('');
const processing = ref(false);

const pendingLoading = ref(false);
const pendingApprovals = ref([]);
const pendingPagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const myLoading = ref(false);
const myApprovals = ref([]);
const myPagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const compareData = computed(() => {
  if (!currentApproval.value?.ReconciliationDiff) return [];
  const diff = currentApproval.value.ReconciliationDiff;
  const eventValue = Number(diff.eventSumValue) || 0;
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
      value: Number(diff.dbAggregationValue) || 0,
      diff: (Number(diff.dbAggregationValue) || 0) - eventValue,
      hasDiff: Math.abs((Number(diff.dbAggregationValue) || 0) - eventValue) > 0.0001,
      description: 'PostgreSQL中的用量聚合数据',
    },
    {
      source: 'Redis配额',
      value: Number(diff.redisQuotaValue) || 0,
      diff: (Number(diff.redisQuotaValue) || 0) - eventValue,
      hasDiff: Math.abs((Number(diff.redisQuotaValue) || 0) - eventValue) > 0.0001,
      description: 'Redis中的实时配额计数',
    },
  ];
});

function canApprove() {
  if (!currentApproval.value) return false;
  if (currentApproval.value.status !== 'approving') return false;
  return true;
}

function getApprovalStep() {
  if (!currentApproval.value) return 0;
  let step = 1;
  if (currentApproval.value.approver1Status) step++;
  if (currentApproval.value.approvalLevel === 'level2' && currentApproval.value.approver2Status) step++;
  if (currentApproval.value.status === 'executed' || currentApproval.value.status === 'failed') step++;
  return step;
}

function getStepStatus(status) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  return 'wait';
}

function getStepIconColor(status) {
  if (status === 'approved') return '#67C23A';
  if (status === 'rejected') return '#F56C6C';
  return '#C0C4CC';
}

async function loadPendingApprovals() {
  pendingLoading.value = true;
  try {
    const res = await reconciliationApi.getPendingApprovals({
      page: pendingPagination.page,
      pageSize: pendingPagination.pageSize,
    });
    if (res.success) {
      pendingApprovals.value = res.data;
      pendingPagination.total = res.total;
    }
  } finally {
    pendingLoading.value = false;
  }
}

async function loadMyApprovals() {
  myLoading.value = true;
  try {
    const res = await reconciliationApi.getMyApprovals({
      page: myPagination.page,
      pageSize: myPagination.pageSize,
    });
    if (res.success) {
      myApprovals.value = res.data;
      myPagination.total = res.total;
    }
  } finally {
    myLoading.value = false;
  }
}

async function viewApprovalDetail(row) {
  try {
    const res = await reconciliationApi.getApprovalDetail(row.id);
    if (res.success) {
      currentApproval.value = res.data;
      approvalOpinion.value = '';
      rejectReason.value = '';
      detailDialogVisible.value = true;
    }
  } catch (e) {}
}

async function approve() {
  processing.value = true;
  try {
    const res = await reconciliationApi.approveApproval(currentApproval.value.id, {
      opinion: approvalOpinion.value,
    });
    if (res.success) {
      ElMessage.success(res.message);
      detailDialogVisible.value = false;
      loadPendingApprovals();
      loadMyApprovals();
    }
  } finally {
    processing.value = false;
  }
}

function showRejectDialog() {
  if (!approvalOpinion.value.trim()) {
    ElMessage.warning('请填写拒绝原因');
    return;
  }
  rejectReason.value = approvalOpinion.value;
  rejectDialogVisible.value = true;
}

async function reject() {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写拒绝原因');
    return;
  }

  processing.value = true;
  try {
    const res = await reconciliationApi.rejectApproval(currentApproval.value.id, {
      opinion: rejectReason.value,
    });
    if (res.success) {
      ElMessage.success(res.message);
      rejectDialogVisible.value = false;
      detailDialogVisible.value = false;
      loadPendingApprovals();
      loadMyApprovals();
    }
  } finally {
    processing.value = false;
  }
}

function formatDateTime(date) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function formatNumber(val) {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  if (Math.abs(num) >= 1000) {
    return num.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  }
  return num.toFixed(Math.abs(num) >= 1 ? 2 : 4);
}

function getApprovalLevelTag(level) {
  const map = { auto: 'success', level1: 'warning', level2: 'danger' };
  return map[level] || 'info';
}

function getApprovalLevelText(level) {
  const map = { auto: '自动', level1: '一级', level2: '二级' };
  return map[level] || level;
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

function getStatusTag(status) {
  const map = {
    pending: 'warning',
    approving: 'primary',
    approved: 'success',
    rejected: 'danger',
    executed: 'success',
    failed: 'danger',
  };
  return map[status] || 'info';
}

function getStatusText(status) {
  const map = {
    pending: '待审批',
    approving: '审批中',
    approved: '已通过',
    rejected: '已拒绝',
    executed: '已执行',
    failed: '执行失败',
  };
  return map[status] || status;
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

function getSeverityTag(severity) {
  const map = { critical: 'danger', warning: 'warning', minor: 'success' };
  return map[severity] || 'info';
}

function getSeverityText(severity) {
  const map = { critical: '严重', warning: '警告', minor: '轻微' };
  return map[severity] || severity;
}

onMounted(() => {
  loadPendingApprovals();
  loadMyApprovals();
});
</script>

<style scoped>
.approval-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.approval-tabs {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.approval-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
}

.approval-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.tab-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  margin-bottom: 16px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.text-red {
  color: #F56C6C;
}

.approval-detail {
  padding: 10px 0;
}

.diff-section,
.compare-section,
.approval-history {
  margin-top: 24px;
}

.diff-section h4,
.compare-section h4,
.approval-history h4 {
  margin: 0 0 12px 0;
  padding-left: 10px;
  border-left: 3px solid #409EFF;
  color: #303133;
  font-size: 15px;
}

.step-content {
  margin-left: 8px;
  padding: 8px 0;
}

.step-content p {
  margin: 4px 0;
  color: #606266;
  font-size: 13px;
}

.opinion-form {
  margin-top: 16px;
}

.action-buttons {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
