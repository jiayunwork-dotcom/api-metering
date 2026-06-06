<template>
  <div class="rules-container">
    <el-card shadow="hover">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="searchForm.keyword"
            placeholder="搜索规则名称/API"
            clearable
            style="width: 240px"
            :prefix-icon="Search"
            @keyup.enter="loadRules"
          />
          <el-select
            v-model="searchForm.status"
            placeholder="状态筛选"
            clearable
            style="width: 140px"
          >
            <el-option label="草稿" value="draft" />
            <el-option label="已激活" value="active" />
            <el-option label="已归档" value="archived" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="loadRules">查询</el-button>
          <el-button :icon="Refresh" @click="resetSearch">重置</el-button>
        </div>
        <div class="toolbar-right">
          <el-button :icon="Plus" @click="handleAddApi">新增API</el-button>
          <el-button type="primary" :icon="Plus" @click="handleCreate">新增规则</el-button>
        </div>
      </div>

      <el-table :data="ruleList" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="规则名称" width="160" show-overflow-tooltip />
        <el-table-column label="API接口" width="180">
          <template #default="{ row }">
            {{ row.apiInterface?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="计费维度" width="140">
          <template #default="{ row }">
            <el-tag
              v-for="dim in row.billingDimensions"
              :key="dim"
              :type="getDimensionType(dim)"
              size="small"
              style="margin-right: 4px"
            >
              {{ getDimensionLabel(dim) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="单价" width="160">
          <template #default="{ row }">
            <div class="price-list">
              <div v-for="dim in row.billingDimensions" :key="dim" class="price-item">
                {{ getDimensionLabel(dim) }}: {{ getPrice(row, dim) }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="阶梯定价" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.hasTiers ? 'primary' : 'info'" size="small">
              {{ row.hasTiers ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生效时间" width="160">
          <template #default="{ row }">
            {{ row.effectiveStart ? formatDate(row.effectiveStart) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getRuleStatusType(row.status)" size="small">
              {{ getRuleStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleView(row)">详情</el-button>
            <el-button type="primary" link size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button
              v-if="row.status === 'draft'"
              type="success"
              link
              size="small"
              @click="handleActivate(row)"
            >
              激活
            </el-button>
            <el-button
              v-if="row.status === 'active'"
              type="info"
              link
              size="small"
              @click="handleArchive(row)"
            >
              归档
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
          @size-change="loadRules"
          @current-change="loadRules"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="ruleDialogVisible"
      :title="isEdit ? '编辑规则' : '新增规则'"
      width="720px"
    >
      <el-form :model="ruleForm" :rules="ruleRules" ref="ruleFormRef" label-width="120px">
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="ruleForm.name" placeholder="请输入规则名称" maxlength="50" />
        </el-form-item>
        <el-form-item label="API接口" prop="apiInterfaceId">
          <el-select v-model="ruleForm.apiInterfaceId" style="width: 100%" placeholder="请选择API接口">
            <el-option
              v-for="api in apiInterfaces"
              :key="api.id"
              :label="api.name + ' - ' + api.path"
              :value="api.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="计费维度" prop="billingDimensions">
          <el-checkbox-group v-model="ruleForm.billingDimensions">
            <el-checkbox value="calls">按调用次数</el-checkbox>
            <el-checkbox value="data_volume">按数据传输量</el-checkbox>
            <el-checkbox value="compute_time">按计算时长</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item
          v-for="dim in ruleForm.billingDimensions"
          :key="'price_' + dim"
          :label="getDimensionLabel(dim) + '单价'"
        >
          <div class="tier-config">
            <el-switch
              v-model="ruleForm.dimensionConfigs[dim].hasTiers"
              active-text="阶梯定价"
              inactive-text="固定单价"
              @change="handleTierSwitch(dim)"
            />
            <div v-if="!ruleForm.dimensionConfigs[dim].hasTiers" style="flex: 1; margin-left: 20px">
              <el-input-number
                v-model="ruleForm.dimensionConfigs[dim].price"
                :min="0"
                :precision="6"
                :step="0.001"
                style="width: 100%"
              />
              <span class="price-unit">元/{{ getDimensionUnit(dim) }}</span>
            </div>
          </div>

          <div v-if="ruleForm.dimensionConfigs[dim].hasTiers" class="tier-editor">
            <div class="tier-header">
              <span>阶梯段 (最多10级)</span>
              <el-button
                type="primary"
                link
                size="small"
                :icon="Plus"
                :disabled="ruleForm.dimensionConfigs[dim].tiers.length >= 10"
                @click="addTier(dim)"
              >
                添加阶梯
              </el-button>
            </div>
            <div
              v-for="(tier, idx) in ruleForm.dimensionConfigs[dim].tiers"
              :key="idx"
              class="tier-row"
            >
              <span class="tier-index">第{{ idx + 1 }}级</span>
              <el-input-number
                v-model="tier.start"
                :min="idx === 0 ? 0 : ruleForm.dimensionConfigs[dim].tiers[idx - 1].end + 1"
                :disabled="idx === 0"
                placeholder="起始值"
                size="small"
                @change="validateTier(dim, idx)"
              />
              <span class="tier-sep">~</span>
              <el-input-number
                v-model="tier.end"
                :min="tier.start"
                placeholder="结束值"
                size="small"
                @change="validateTier(dim, idx)"
              />
              <span class="tier-price-label">单价:</span>
              <el-input-number
                v-model="tier.price"
                :min="0"
                :precision="6"
                :step="0.001"
                placeholder="单价"
                size="small"
              />
              <span class="price-unit">元/{{ getDimensionUnit(dim) }}</span>
              <el-button
                type="danger"
                link
                size="small"
                :icon="Delete"
                :disabled="ruleForm.dimensionConfigs[dim].tiers.length <= 1"
                @click="removeTier(dim, idx)"
              />
            </div>
            <div v-if="ruleForm.dimensionConfigs[dim].tiers.length > 0" class="tier-add-bottom">
              <el-switch
                v-model="ruleForm.dimensionConfigs[dim].unlimitedEnd"
                active-text="最后一级无上限"
              />
            </div>
          </div>
        </el-form-item>

        <el-form-item label="生效周期" prop="effectiveStart">
          <el-date-picker
            v-model="ruleForm.effectiveStart"
            type="month"
            placeholder="选择开始月份"
            value-format="YYYY-MM"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="规则描述" prop="description">
          <el-input
            v-model="ruleForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入规则描述"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <div v-if="historyVisible && currentRuleId" class="history-section">
        <el-divider content-position="left">变更历史</el-divider>
        <el-timeline>
          <el-timeline-item
            v-for="h in historyList"
            :key="h.id"
            :timestamp="formatDate(h.createdAt)"
          >
            <el-tag :type="h.action === 'create' ? 'primary' : h.action === 'update' ? 'warning' : 'info'" size="small">
              {{ h.action === 'create' ? '创建' : h.action === 'update' ? '更新' : h.action }}
            </el-tag>
            <span style="margin-left: 8px">{{ h.description }}</span>
            <span class="history-user">操作人: {{ h.operatorName }}</span>
          </el-timeline-item>
        </el-timeline>
      </div>

      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="apiDialogVisible"
      title="新增API接口"
      width="500px"
    >
      <el-form :model="apiForm" :rules="apiRules" ref="apiFormRef" label-width="100px">
        <el-form-item label="API名称" prop="name">
          <el-input v-model="apiForm.name" placeholder="请输入API名称" maxlength="100" />
        </el-form-item>
        <el-form-item label="API路径" prop="path">
          <el-input v-model="apiForm.path" placeholder="例如: /api/v1/users" maxlength="200" />
        </el-form-item>
        <el-form-item label="请求方法" prop="method">
          <el-select v-model="apiForm.method" style="width: 100%">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="DELETE" value="DELETE" />
            <el-option label="PATCH" value="PATCH" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="apiForm.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="apiDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="apiSubmitting" @click="handleSubmitApi">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Refresh, Delete } from '@element-plus/icons-vue';
import { ruleApi } from '../api';

const loading = ref(false);
const submitting = ref(false);
const apiSubmitting = ref(false);
const ruleDialogVisible = ref(false);
const apiDialogVisible = ref(false);
const historyVisible = ref(false);
const isEdit = ref(false);
const currentRuleId = ref(null);
const ruleFormRef = ref();
const apiFormRef = ref();
const ruleList = ref([]);
const apiInterfaces = ref([]);
const historyList = ref([]);

const searchForm = reactive({
  keyword: '',
  status: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const ruleForm = reactive({
  id: null,
  name: '',
  apiInterfaceId: null,
  billingDimensions: ['calls'],
  dimensionConfigs: {
    calls: { hasTiers: false, price: 0.01, tiers: [], unlimitedEnd: false },
    data_volume: { hasTiers: false, price: 0.001, tiers: [], unlimitedEnd: false },
    compute_time: { hasTiers: false, price: 0.005, tiers: [], unlimitedEnd: false },
  },
  effectiveStart: null,
  description: '',
  status: 'draft',
});

const ruleRules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  apiInterfaceId: [{ required: true, message: '请选择API接口', trigger: 'change' }],
  billingDimensions: [{ required: true, message: '请选择至少一个计费维度', type: 'array' }],
  effectiveStart: [{ required: true, message: '请选择生效周期', trigger: 'change' }],
};

const apiForm = reactive({
  name: '',
  path: '',
  method: 'GET',
  description: '',
});

const apiRules = {
  name: [{ required: true, message: '请输入API名称', trigger: 'blur' }],
  path: [{ required: true, message: '请输入API路径', trigger: 'blur' }],
  method: [{ required: true, message: '请选择请求方法', trigger: 'change' }],
};

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleString('zh-CN') : '-';
}

function getDimensionType(dim) {
  const types = { calls: 'primary', data_volume: 'success', compute_time: 'warning' };
  return types[dim] || 'info';
}

function getDimensionLabel(dim) {
  const labels = { calls: '调用次数', data_volume: '数据量', compute_time: '计算时长' };
  return labels[dim] || dim;
}

function getDimensionUnit(dim) {
  const units = { calls: '次', data_volume: 'MB', compute_time: '秒' };
  return units[dim] || '';
}

function getRuleStatusType(status) {
  const types = { draft: 'info', active: 'success', archived: 'warning' };
  return types[status] || 'info';
}

function getRuleStatusLabel(status) {
  const labels = { draft: '草稿', active: '已激活', archived: '已归档' };
  return labels[status] || status;
}

function getPrice(row, dim) {
  const config = row.dimensionConfigs?.[dim];
  if (!config) return '-';
  if (config.hasTiers) return '阶梯价';
  return config.price + ' 元/' + getDimensionUnit(dim);
}

async function loadRules() {
  loading.value = true;
  try {
    const res = await ruleApi.getList({
      ...searchForm,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if (res.success) {
      ruleList.value = res.data;
      pagination.total = res.total;
    }
  } finally {
    loading.value = false;
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

function resetSearch() {
  searchForm.keyword = '';
  searchForm.status = '';
  pagination.page = 1;
  loadRules();
}

function handleCreate() {
  isEdit.value = false;
  historyVisible.value = false;
  currentRuleId.value = null;
  Object.assign(ruleForm, {
    id: null,
    name: '',
    apiInterfaceId: null,
    billingDimensions: ['calls'],
    dimensionConfigs: {
      calls: { hasTiers: false, price: 0.01, tiers: [], unlimitedEnd: false },
      data_volume: { hasTiers: false, price: 0.001, tiers: [], unlimitedEnd: false },
      compute_time: { hasTiers: false, price: 0.005, tiers: [], unlimitedEnd: false },
    },
    effectiveStart: null,
    description: '',
    status: 'draft',
  });
  ruleDialogVisible.value = true;
}

function handleEdit(row) {
  isEdit.value = true;
  currentRuleId.value = row.id;
  historyVisible.value = true;
  Object.assign(ruleForm, JSON.parse(JSON.stringify(row)));
  loadHistory(row.id);
  ruleDialogVisible.value = true;
}

function handleView(row) {
  handleEdit(row);
}

async function handleActivate(row) {
  try {
    await ElMessageBox.confirm('确定要激活此规则吗？激活后将在下一计费周期生效。', '确认', {
      type: 'warning',
    });
    
    const res = await ruleApi.activate(row.id);
    if (res.success) {
      ElMessage.success('激活成功');
      loadRules();
    }
  } catch (e) {}
}

async function handleArchive(row) {
  try {
    await ElMessageBox.confirm('确定要归档此规则吗？归档后将不再生效。', '确认', {
      type: 'warning',
    });
    
    const res = await ruleApi.archive(row.id);
    if (res.success) {
      ElMessage.success('归档成功');
      loadRules();
    }
  } catch (e) {}
}

async function loadHistory(ruleId) {
  try {
    const res = await ruleApi.getHistory(ruleId);
    if (res.success) {
      historyList.value = res.data || [];
    }
  } catch (e) {}
}

function handleTierSwitch(dim) {
  if (ruleForm.dimensionConfigs[dim].hasTiers && ruleForm.dimensionConfigs[dim].tiers.length === 0) {
    addTier(dim);
  }
}

function addTier(dim) {
  const tiers = ruleForm.dimensionConfigs[dim].tiers;
  const lastTier = tiers[tiers.length - 1];
  const newStart = lastTier ? lastTier.end + 1 : 0;
  
  tiers.push({
    start: newStart,
    end: newStart + 9999,
    price: lastTier ? lastTier.price : ruleForm.dimensionConfigs[dim].price || 0.01,
  });
}

function removeTier(dim, idx) {
  ruleForm.dimensionConfigs[dim].tiers.splice(idx, 1);
}

async function validateTier(dim, idx) {
  try {
    const tiers = ruleForm.dimensionConfigs[dim].tiers;
    const res = await ruleApi.validateTiers({ tiers });
    if (!res.success) {
      ElMessage.warning(res.message);
    }
  } catch (e) {}
}

async function handleSubmit() {
  if (!ruleFormRef.value) return;
  
  await ruleFormRef.value.validate(async (valid) => {
    if (!valid) return;
    
    submitting.value = true;
    try {
      const submitData = { ...ruleForm };
      
      const res = isEdit.value
        ? await ruleApi.update(ruleForm.id, submitData)
        : await ruleApi.create(submitData);
      
      if (res.success) {
        ElMessage.success(isEdit.value ? '修改成功' : '创建成功');
        ruleDialogVisible.value = false;
        loadRules();
      }
    } finally {
      submitting.value = false;
    }
  });
}

function handleAddApi() {
  Object.assign(apiForm, { name: '', path: '', method: 'GET', description: '' });
  apiDialogVisible.value = true;
}

async function handleSubmitApi() {
  if (!apiFormRef.value) return;
  
  await apiFormRef.value.validate(async (valid) => {
    if (!valid) return;
    
    apiSubmitting.value = true;
    try {
      const res = await ruleApi.createApiInterface(apiForm);
      if (res.success) {
        ElMessage.success('API创建成功');
        apiDialogVisible.value = false;
        loadApiInterfaces();
      }
    } finally {
      apiSubmitting.value = false;
    }
  });
}

onMounted(() => {
  loadRules();
  loadApiInterfaces();
});
</script>

<style scoped>
.rules-container {
  padding: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  gap: 12px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.price-list {
  font-size: 12px;
}

.price-item {
  margin-bottom: 2px;
}

.tier-config {
  display: flex;
  align-items: center;
  width: 100%;
}

.price-unit {
  margin-left: 8px;
  color: #909399;
  font-size: 13px;
}

.tier-editor {
  margin-top: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.tier-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 500;
  color: #303133;
}

.tier-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tier-index {
  width: 60px;
  font-size: 13px;
  color: #606266;
}

.tier-sep {
  color: #909399;
}

.tier-price-label {
  color: #606266;
  font-size: 13px;
}

.tier-add-bottom {
  margin-top: 8px;
}

.history-section {
  max-height: 240px;
  overflow-y: auto;
}

.history-user {
  margin-left: 16px;
  color: #909399;
  font-size: 12px;
}
</style>
