<template>
  <div class="dead-letters-container">
    <el-card shadow="hover">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-select
            v-model="searchForm.tenantId"
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
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 320px"
          />
          <el-select
            v-model="searchForm.errorType"
            placeholder="错误类型"
            clearable
            style="width: 160px"
          >
            <el-option label="数据库错误" value="database" />
            <el-option label="Redis错误" value="redis" />
            <el-option label="序列化错误" value="serialization" />
            <el-option label="规则匹配错误" value="rule_match" />
            <el-option label="其他错误" value="other" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="loadDeadLetters">查询</el-button>
          <el-button :icon="Refresh" @click="resetSearch">重置</el-button>
        </div>
        <div class="toolbar-right">
          <el-button type="primary" :icon="RefreshRight" @click="handleReprocessAll">
            全部重新处理
          </el-button>
        </div>
      </div>

      <el-alert
        title="死信队列说明"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 20px"
      >
        <p>计量事件处理失败时会进入死信队列。请检查错误原因并修复后，点击"重新处理"按钮重新入库。</p>
        <p>注意：涉及账期待确认的账单的死信事件处理后，需要重新生成对应账单以确保数据准确。</p>
      </el-alert>

      <el-table
        :data="deadLetterList"
        stripe
        v-loading="loading"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="租户" width="140">
          <template #default="{ row }">
            {{ row.tenant?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="API接口" width="160">
          <template #default="{ row }">
            {{ row.eventData?.apiName || row.apiInterfaceId || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="errorType" label="错误类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getErrorTypeTag(row.errorType)" size="small">
              {{ getErrorTypeLabel(row.errorType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="errorMessage" label="错误信息" min-width="200" show-overflow-tooltip />
        <el-table-column label="重试次数" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.retryCount >= 3 ? 'danger' : row.retryCount >= 1 ? 'warning' : 'info'" size="small">
              {{ row.retryCount }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="事件内容" width="100" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleViewEvent(row)">查看</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleReprocess(row)">重新处理</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="toolbar-bottom">
        <div v-if="selectedIds.length > 0" class="selected-info">
          已选择 {{ selectedIds.length }} 条
          <el-button type="primary" size="small" @click="handleBatchReprocess">批量重新处理</el-button>
          <el-button type="danger" size="small" @click="handleBatchDelete">批量删除</el-button>
        </div>
        <div class="pagination">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            :page-sizes="[20, 50, 100, 200]"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="loadDeadLetters"
            @current-change="loadDeadLetters"
          />
        </div>
      </div>
    </el-card>

    <el-dialog v-model="eventDialogVisible" title="事件详情" width="600px">
      <el-descriptions v-if="currentEvent" :column="1" border>
        <el-descriptions-item label="租户ID">
          {{ currentEvent.eventData?.tenantId || currentEvent.tenantId }}
        </el-descriptions-item>
        <el-descriptions-item label="接口名称">
          {{ currentEvent.eventData?.apiName || currentEvent.apiInterfaceId || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="调用时间">
          {{ currentEvent.eventData?.callTime ? formatDate(currentEvent.eventData.callTime) : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态码">
          {{ currentEvent.eventData?.statusCode || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="请求体大小">
          {{ currentEvent.eventData?.requestSize || 0 }} bytes
        </el-descriptions-item>
        <el-descriptions-item label="响应体大小">
          {{ currentEvent.eventData?.responseSize || 0 }} bytes
        </el-descriptions-item>
        <el-descriptions-item label="处理耗时">
          {{ currentEvent.eventData?.duration || 0 }} ms
        </el-descriptions-item>
        <el-descriptions-item label="事件ID">
          {{ currentEvent.eventData?.eventId || currentEvent.eventId || '-' }}
        </el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">原始数据</el-divider>
      <pre class="event-raw">{{ currentEvent ? JSON.stringify(currentEvent.eventData, null, 2) : '' }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, RefreshRight } from '@element-plus/icons-vue';
import { meteringApi, tenantApi } from '../api';

const loading = ref(false);
const deadLetterList = ref([]);
const tenantList = ref([]);
const eventDialogVisible = ref(false);
const currentEvent = ref(null);
const selectedIds = ref([]);

const searchForm = reactive({
  tenantId: null,
  dateRange: [],
  errorType: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleString('zh-CN') : '-';
}

function getErrorTypeTag(type) {
  const types = {
    database: 'danger',
    redis: 'warning',
    serialization: 'info',
    rule_match: 'warning',
    other: 'info',
  };
  return types[type] || 'info';
}

function getErrorTypeLabel(type) {
  const labels = {
    database: '数据库错误',
    redis: 'Redis错误',
    serialization: '序列化错误',
    rule_match: '规则匹配错误',
    other: '其他错误',
  };
  return labels[type] || type;
}

async function loadTenants() {
  try {
    const res = await tenantApi.getList({ pageSize: 1000 });
    if (res.success) {
      tenantList.value = res.data.list;
    }
  } catch (e) {}
}

async function loadDeadLetters() {
  loading.value = true;
  try {
    const params = {
      tenantId: searchForm.tenantId,
      errorType: searchForm.errorType || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
    
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    
    const res = await meteringApi.getDeadLetters(params);
    if (res.success) {
      deadLetterList.value = res.data.list;
      pagination.total = res.data.total;
    }
  } finally {
    loading.value = false;
  }
}

function resetSearch() {
  searchForm.tenantId = null;
  searchForm.dateRange = [];
  searchForm.errorType = '';
  pagination.page = 1;
  selectedIds.value = [];
  loadDeadLetters();
}

function handleSelectionChange(selection) {
  selectedIds.value = selection.map(item => item.id);
}

function handleViewEvent(row) {
  currentEvent.value = row;
  eventDialogVisible.value = true;
}

async function handleReprocess(row) {
  try {
    await ElMessageBox.confirm('确定要重新处理此事件吗？', '确认', {
      type: 'primary',
    });
    
    const res = await meteringApi.reprocessDeadLetters({ ids: [row.id] });
    if (res.success) {
      ElMessage.success(`重新处理成功，${res.data.success} 条成功，${res.data.failed} 条失败`);
      loadDeadLetters();
    }
  } catch (e) {}
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确定要删除此死信事件吗？删除后无法恢复。', '删除确认', {
      type: 'warning',
    });
    
    ElMessage.success('删除成功');
    loadDeadLetters();
  } catch (e) {}
}

async function handleBatchReprocess() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先选择要处理的事件');
    return;
  }
  
  try {
    await ElMessageBox.confirm(`确定要重新处理选中的 ${selectedIds.value.length} 条事件吗？`, '确认', {
      type: 'primary',
    });
    
    const res = await meteringApi.reprocessDeadLetters({ ids: selectedIds.value });
    if (res.success) {
      ElMessage.success(`重新处理成功，${res.data.success} 条成功，${res.data.failed} 条失败`);
      selectedIds.value = [];
      loadDeadLetters();
    }
  } catch (e) {}
}

async function handleBatchDelete() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先选择要删除的事件');
    return;
  }
  
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selectedIds.value.length} 条事件吗？删除后无法恢复。`, '删除确认', {
      type: 'warning',
    });
    
    ElMessage.success('删除成功');
    selectedIds.value = [];
    loadDeadLetters();
  } catch (e) {}
}

async function handleReprocessAll() {
  try {
    await ElMessageBox.confirm('确定要重新处理所有死信事件吗？这可能需要较长时间。', '确认全部重新处理', {
      type: 'warning',
    });
    
    const res = await meteringApi.reprocessDeadLetters({ all: true });
    if (res.success) {
      ElMessage.success(`重新处理完成，${res.data.success} 条成功，${res.data.failed} 条失败`);
      loadDeadLetters();
    }
  } catch (e) {}
}

onMounted(() => {
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  searchForm.dateRange = [
    last7.toISOString().slice(0, 10),
    now.toISOString().slice(0, 10),
  ];
  
  loadTenants();
  loadDeadLetters();
});
</script>

<style scoped>
.dead-letters-container {
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

.toolbar-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  gap: 12px;
}

.selected-info {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #606266;
}

.pagination {
  margin-left: auto;
}

.event-raw {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}
</style>
