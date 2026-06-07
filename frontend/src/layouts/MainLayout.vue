<template>
  <el-container class="layout-container">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <el-icon :size="28" color="#409EFF"><DataLine /></el-icon>
        <span class="logo-text">API计量平台</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="sidebar-menu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item
          v-for="route in menuRoutes"
          :key="route.path"
          :index="`/${route.path}`"
        >
          <el-icon><component :is="route.meta.icon" /></el-icon>
          <span>{{ route.meta.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="'/dashboard'">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentRoute.meta.title">
              {{ currentRoute.meta.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <div class="notification-icon" @click="showNotificationDrawer = true">
            <el-badge :value="unreadAlertCount" :hidden="unreadAlertCount === 0" class="notification-badge">
              <el-icon :size="20"><Bell /></el-icon>
            </el-badge>
          </div>
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" :icon="UserFilled" />
              <span class="username">{{ userStore.user?.name }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>

    <el-drawer
      v-model="showNotificationDrawer"
      title="告警消息"
      direction="rtl"
      size="480px"
    >
      <div class="notification-header">
        <span class="unread-tip">未读消息: {{ unreadAlertCount }} 条</span>
        <el-button
          v-if="unreadAlertCount > 0"
          type="primary"
          link
          @click="markAllAlertsRead"
        >
          全部标记已读
        </el-button>
      </div>
      
      <div v-loading="alertLoading" class="notification-list">
        <el-empty v-if="alertRecords.length === 0 && !alertLoading" description="暂无告警消息" />
        
        <div
          v-for="record in alertRecords"
          :key="record.id"
          class="notification-item"
          :class="{ 'is-unread': !record.read }"
        >
          <div class="notification-item-header">
            <div class="notification-title">
              <el-icon class="alert-icon" color="#F56C6C"><Warning /></el-icon>
              <span>对账差异告警</span>
              <el-tag
                :type="getAlertStatusTag(record.sendStatus)"
                size="small"
                effect="light"
              >
                {{ getAlertStatusText(record.sendStatus) }}
              </el-tag>
            </div>
            <el-button
              v-if="!record.read"
              type="primary"
              link
              size="small"
              @click.stop="markAlertRead(record.id)"
            >
              标记已读
            </el-button>
          </div>
          
          <div class="notification-content">
            <p class="notification-desc">
              对账任务 <strong>{{ record.ReconciliationTask?.taskNo }}</strong> 
              发现 <strong style="color: #F56C6C">{{ record.diffCount }}</strong> 条差异
            </p>
            <p class="notification-time">{{ formatAlertTime(record.alertTime) }}</p>
            
            <div v-if="record.alertContent?.diffs" class="diff-preview">
              <p class="preview-title">前 {{ record.alertContent.diffs.length }} 条差异:</p>
              <div v-for="(diff, idx) in record.alertContent.diffs.slice(0, 3)" :key="idx" class="diff-item">
                <span class="diff-tag" :class="diff.severity">
                  {{ diff.severity === 'critical' ? '严重' : diff.severity === 'warning' ? '警告' : '轻微' }}
                </span>
                <span class="diff-text">
                  {{ diff.tenantName }} - {{ diff.apiName }} | 
                  {{ diff.dateKey }} | 
                  差异: {{ Number(diff.diffAmount).toFixed(2) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="alertPagination.total > 0" class="pagination">
        <el-pagination
          v-model:current-page="alertPagination.page"
          v-model:page-size="alertPagination.pageSize"
          :total="alertPagination.total"
          :page-sizes="[10, 20, 50]"
          layout="prev, pager, next"
          @size-change="loadAlertRecords"
          @current-change="loadAlertRecords"
        />
      </div>
    </el-drawer>

    <el-dialog
      v-model="passwordDialogVisible"
      title="修改密码"
      width="400px"
    >
      <el-form :model="passwordForm" label-width="80px">
        <el-form-item label="原密码">
          <el-input
            v-model="passwordForm.oldPassword"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认密码">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleChangePassword">确认</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import {
  DataLine, User, Setting, Document, Tickets,
  DataAnalysis, Warning, UserFilled, ArrowDown,
  Check, Tools, Bell,
} from '@element-plus/icons-vue';
import { useUserStore } from '../stores/user';
import { authApi, reconciliationApi } from '../api';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const showNotificationDrawer = ref(false);
const unreadAlertCount = ref(0);
const alertRecords = ref([]);
const alertLoading = ref(false);
const alertPagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
});

async function loadUnreadCount() {
  try {
    const res = await reconciliationApi.getUnreadAlertCount();
    if (res.success) {
      unreadAlertCount.value = res.data.count;
    }
  } catch (e) {}
}

async function loadAlertRecords() {
  alertLoading.value = true;
  try {
    const res = await reconciliationApi.getAlertRecords({
      page: alertPagination.value.page,
      pageSize: alertPagination.value.pageSize,
      channel: 'internal',
    });
    if (res.success) {
      alertRecords.value = res.data;
      alertPagination.value.total = res.total;
    }
  } finally {
    alertLoading.value = false;
  }
}

async function markAlertRead(id) {
  try {
    const res = await reconciliationApi.markAlertRead(id);
    if (res.success) {
      await loadUnreadCount();
      await loadAlertRecords();
    }
  } catch (e) {}
}

async function markAllAlertsRead() {
  try {
    const res = await reconciliationApi.markAllAlertsRead();
    if (res.success) {
      ElMessage.success(res.message);
      await loadUnreadCount();
      await loadAlertRecords();
    }
  } catch (e) {}
}

function formatAlertTime(date) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function getAlertStatusTag(status) {
  const map = {
    success: 'success',
    failed: 'danger',
    retrying: 'warning',
  };
  return map[status] || 'info';
}

function getAlertStatusText(status) {
  const map = {
    success: '成功',
    failed: '失败',
    retrying: '重试中',
  };
  return map[status] || status;
}

loadUnreadCount();

setInterval(() => {
  loadUnreadCount();
}, 30000);

watch(showNotificationDrawer, (val) => {
  if (val) {
    loadAlertRecords();
  }
});

const activeMenu = computed(() => route.path);
const currentRoute = computed(() => route);
const menuRoutes = computed(() => {
  const mainRoute = router.options.routes.find(r => r.path === '/');
  if (!mainRoute || !mainRoute.children) return [];
  return mainRoute.children.filter(r => !r.meta?.hidden);
});

const passwordDialogVisible = ref(false);
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

function handleCommand(command) {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }).then(() => {
      userStore.logout();
      router.push('/login');
      ElMessage.success('已退出登录');
    }).catch(() => {});
  } else if (command === 'password') {
    passwordDialogVisible.value = true;
  }
}

async function handleChangePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    ElMessage.error('两次输入的密码不一致');
    return;
  }

  try {
    const res = await authApi.changePassword({
      oldPassword: passwordForm.value.oldPassword,
      newPassword: passwordForm.value.newPassword,
    });
    if (res.success) {
      ElMessage.success('密码修改成功');
      passwordDialogVisible.value = false;
      passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
    }
  } catch (e) {}
}
</script>

<style scoped>
.layout-container {
  height: 100%;
}

.sidebar {
  background-color: #304156;
  overflow-y: auto;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-bottom: 1px solid #1f2d3d;
}

.logo-text {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}

.sidebar-menu {
  border-right: none;
}

.header {
  background-color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid #e4e7ed;
  height: 60px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.username {
  font-size: 14px;
  color: #606266;
}

.main-content {
  background-color: #f5f7fa;
  padding: 0;
  overflow-y: auto;
}

.notification-icon {
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
}

.notification-icon:hover {
  background-color: #f5f7fa;
}

.notification-badge :deep(.el-badge__content) {
  top: 6px;
  right: 4px;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px 16px;
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 16px;
}

.unread-tip {
  color: #909399;
  font-size: 14px;
}

.notification-list {
  padding: 0 16px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.notification-item {
  padding: 16px;
  border-radius: 8px;
  background-color: #fff;
  margin-bottom: 12px;
  border: 1px solid #e4e7ed;
  transition: all 0.2s;
}

.notification-item:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.notification-item.is-unread {
  background-color: #ecf5ff;
  border-color: #b3d8ff;
}

.notification-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.notification-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #303133;
}

.alert-icon {
  font-size: 18px;
}

.notification-content {
  color: #606266;
}

.notification-desc {
  margin: 0 0 8px 0;
  font-size: 14px;
  line-height: 1.5;
}

.notification-time {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: #909399;
}

.diff-preview {
  padding-top: 12px;
  border-top: 1px dashed #e4e7ed;
}

.preview-title {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #909399;
}

.diff-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.diff-tag {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
}

.diff-tag.critical {
  background-color: #fef0f0;
  color: #f56c6c;
}

.diff-tag.warning {
  background-color: #fdf6ec;
  color: #e6a23c;
}

.diff-tag.minor {
  background-color: #f0f9eb;
  color: #67c23a;
}

.diff-text {
  color: #606266;
}

.pagination {
  display: flex;
  justify-content: center;
  padding: 16px;
  border-top: 1px solid #e4e7ed;
}
</style>
