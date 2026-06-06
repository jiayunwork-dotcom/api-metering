<template>
  <div class="tenants-container">
    <el-card shadow="hover">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="searchForm.keyword"
            placeholder="搜索租户名称/ID"
            clearable
            style="width: 240px"
            :prefix-icon="Search"
            @keyup.enter="loadTenants"
          />
          <el-select
            v-model="searchForm.status"
            placeholder="状态筛选"
            clearable
            style="width: 140px"
          >
            <el-option label="正常" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="loadTenants">查询</el-button>
          <el-button :icon="Refresh" @click="resetSearch">重置</el-button>
        </div>
        <div class="toolbar-right">
          <el-button type="primary" :icon="Plus" @click="handleCreate">新增租户</el-button>
        </div>
      </div>

      <el-table
        :data="tenantList"
        stripe
        v-loading="loading"
        @row-click="handleRowClick"
        style="cursor: pointer"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="租户名称" width="160" show-overflow-tooltip />
        <el-table-column prop="code" label="租户编码" width="140" show-overflow-tooltip />
        <el-table-column prop="contactEmail" label="管理员邮箱" show-overflow-tooltip />
        <el-table-column prop="contactPhone" label="联系电话" width="130" />
        <el-table-column label="配额使用" width="160">
          <template #default="{ row }">
            <div class="quota-progress">
              <el-progress
                :percentage="getQuotaPercentage(row)"
                :color="getQuotaColor(row)"
                :stroke-width="12"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '正常' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click.stop="handleView(row)">详情</el-button>
            <el-button type="primary" link size="small" @click.stop="handleEdit(row)">编辑</el-button>
            <el-button
              :type="row.status === 'active' ? 'danger' : 'success'"
              link
              size="small"
              @click.stop="handleToggleStatus(row)"
            >
              {{ row.status === 'active' ? '停用' : '启用' }}
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
          @size-change="loadTenants"
          @current-change="loadTenants"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑租户' : '新增租户'"
      width="560px"
    >
      <el-form :model="tenantForm" :rules="tenantRules" ref="tenantFormRef" label-width="100px">
        <el-form-item label="租户名称" prop="name">
          <el-input v-model="tenantForm.name" placeholder="请输入租户名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="租户编码" prop="code">
          <el-input v-model="tenantForm.code" placeholder="请输入租户编码(英文)" maxlength="32" />
        </el-form-item>
        <el-form-item label="管理员邮箱" prop="contactEmail">
          <el-input v-model="tenantForm.contactEmail" placeholder="请输入管理员邮箱" />
        </el-form-item>
        <el-form-item label="联系电话" prop="contactPhone">
          <el-input v-model="tenantForm.contactPhone" placeholder="请输入联系电话" maxlength="20" />
        </el-form-item>
        <el-form-item label="公司名称" prop="companyName">
          <el-input v-model="tenantForm.companyName" placeholder="请输入公司名称" maxlength="100" />
        </el-form-item>
        <el-form-item label="公司税号" prop="taxNumber">
          <el-input v-model="tenantForm.taxNumber" placeholder="请输入公司税号" maxlength="30" />
        </el-form-item>
        <el-form-item label="公司地址" prop="address">
          <el-input v-model="tenantForm.address" placeholder="请输入公司地址" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="tenantForm.remark" placeholder="请输入备注" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Refresh } from '@element-plus/icons-vue';
import { tenantApi } from '../api';

const router = useRouter();

const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const tenantFormRef = ref();
const tenantList = ref([]);

const searchForm = reactive({
  keyword: '',
  status: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const tenantForm = reactive({
  id: null,
  name: '',
  code: '',
  contactEmail: '',
  contactPhone: '',
  companyName: '',
  taxNumber: '',
  address: '',
  remark: '',
});

const tenantRules = {
  name: [{ required: true, message: '请输入租户名称', trigger: 'blur' }],
  code: [
    { required: true, message: '请输入租户编码', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '只能包含英文、数字和下划线', trigger: 'blur' },
  ],
  contactEmail: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
  contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('zh-CN');
}

function getQuotaPercentage(row) {
  if (!row.quotaUsage) return 0;
  return Math.min(Math.round((row.quotaUsage.used / row.quotaUsage.total) * 100), 100);
}

function getQuotaColor(row) {
  const percent = getQuotaPercentage(row);
  if (percent >= 95) return '#F56C6C';
  if (percent >= 80) return '#E6A23C';
  return '#67C23A';
}

async function loadTenants() {
  loading.value = true;
  try {
    const res = await tenantApi.getList({
      ...searchForm,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if (res.success) {
      tenantList.value = res.data;
      pagination.total = res.total;
    }
  } finally {
    loading.value = false;
  }
}

function resetSearch() {
  searchForm.keyword = '';
  searchForm.status = '';
  pagination.page = 1;
  loadTenants();
}

function handleCreate() {
  isEdit.value = false;
  Object.assign(tenantForm, {
    id: null,
    name: '',
    code: '',
    contactEmail: '',
    contactPhone: '',
    companyName: '',
    taxNumber: '',
    address: '',
    remark: '',
  });
  dialogVisible.value = true;
}

function handleEdit(row) {
  isEdit.value = true;
  Object.assign(tenantForm, row);
  dialogVisible.value = true;
}

function handleView(row) {
  router.push(`/tenants/${row.id}`);
}

function handleRowClick(row) {
  router.push(`/tenants/${row.id}`);
}

async function handleToggleStatus(row) {
  const action = row.status === 'active' ? '停用' : '启用';
  try {
    await ElMessageBox.confirm(`确定要${action}租户【${row.name}】吗？`, '确认', {
      type: 'warning',
    });
    
    const res = await tenantApi.toggleStatus(row.id);
    if (res.success) {
      ElMessage.success(`${action}成功`);
      loadTenants();
    }
  } catch (e) {}
}

async function handleSubmit() {
  if (!tenantFormRef.value) return;
  
  await tenantFormRef.value.validate(async (valid) => {
    if (!valid) return;
    
    submitting.value = true;
    try {
      const res = isEdit.value
        ? await tenantApi.update(tenantForm.id, tenantForm)
        : await tenantApi.create(tenantForm);
      
      if (res.success) {
        ElMessage.success(isEdit.value ? '修改成功' : '创建成功');
        dialogVisible.value = false;
        loadTenants();
      }
    } finally {
      submitting.value = false;
    }
  });
}

onMounted(() => {
  loadTenants();
});
</script>

<style scoped>
.tenants-container {
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

.quota-progress {
  width: 100%;
}
</style>
