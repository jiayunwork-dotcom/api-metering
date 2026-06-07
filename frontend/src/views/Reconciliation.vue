<template>
  <div class="reconciliation-page">
    <div class="page-header">
      <h2>数据对账</h2>
      <p class="subtitle">管理计量数据一致性检查、差异修正与事件重放</p>
    </div>

    <el-tabs v-model="activeTab" class="reconciliation-tabs">
      <el-tab-pane label="对账任务" name="tasks">
        <ReconciliationTasks />
      </el-tab-pane>
      <el-tab-pane label="差异处理" name="diffs">
        <ReconciliationDiffs />
      </el-tab-pane>
      <el-tab-pane label="事件重放" name="replay">
        <ReconciliationReplay />
      </el-tab-pane>
      <el-tab-pane label="审计日志" name="audit">
        <ReconciliationAudit @navigate="handleNavigate" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import ReconciliationTasks from '../components/reconciliation/ReconciliationTasks.vue';
import ReconciliationDiffs from '../components/reconciliation/ReconciliationDiffs.vue';
import ReconciliationReplay from '../components/reconciliation/ReconciliationReplay.vue';
import ReconciliationAudit from '../components/reconciliation/ReconciliationAudit.vue';

const activeTab = ref('tasks');

function handleNavigate(tabName, id) {
  activeTab.value = tabName;
}
</script>

<style scoped>
.reconciliation-page {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: #303133;
}

.page-header .subtitle {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.reconciliation-tabs {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.reconciliation-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
}

.reconciliation-tabs :deep(.el-tab-pane) {
  height: 100%;
}
</style>
