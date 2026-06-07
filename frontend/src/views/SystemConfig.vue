<template>
  <div class="system-config-page">
    <div class="page-header">
      <h2>系统配置</h2>
      <p class="subtitle">管理系统全局配置参数</p>
    </div>

    <el-card class="config-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">对账告警配置</span>
          <el-switch
            v-model="alertConfig.enabled"
            @change="handleEnabledChange"
            active-text="启用"
            inactive-text="禁用"
          />
        </div>
      </template>

      <el-form
        ref="alertConfigFormRef"
        :model="alertConfig"
        :disabled="!alertConfig.enabled"
        label-width="140px"
      >
        <el-form-item label="告警阈值">
          <el-input-number
            v-model="alertConfig.diffThreshold"
            :min="1"
            :max="1000"
            :step="1"
            style="width: 200px"
          />
          <span class="form-tip">当对账差异数量超过此值时触发告警，默认5条</span>
        </el-form-item>

        <el-form-item label="通知方式">
          <el-checkbox-group v-model="alertConfig.notificationMethods">
            <el-checkbox label="internal">站内消息</el-checkbox>
            <el-checkbox label="webhook">WebHook回调</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-divider v-if="alertConfig.notificationMethods.includes('webhook')" />

        <div v-if="alertConfig.notificationMethods.includes('webhook')" class="webhook-section">
          <h4 class="section-title">WebHook配置</h4>

          <el-form-item label="WebHook URL">
            <el-input
              v-model="alertConfig.webhookUrl"
              placeholder="https://your-webhook-endpoint.com/api/alert"
              style="width: 500px"
            />
          </el-form-item>

          <el-form-item label="自定义请求头">
            <el-button type="primary" link @click="openHeadersDialog">
              {{ Object.keys(alertConfig.webhookHeaders || {}).length > 0 ? '编辑请求头' : '添加请求头' }}
            </el-button>
            <span v-if="Object.keys(alertConfig.webhookHeaders || {}).length > 0" class="form-tip">
              已配置 {{ Object.keys(alertConfig.webhookHeaders).length }} 个请求头
            </span>
          </el-form-item>

          <el-form-item label="超时时间">
            <el-input-number
              v-model="alertConfig.webhookTimeout"
              :min="1000"
              :max="30000"
              :step="1000"
              style="width: 200px"
            />
            <span class="form-tip">毫秒，默认5000</span>
          </el-form-item>

          <el-form-item label="最大重试次数">
            <el-input-number
              v-model="alertConfig.webhookMaxRetries"
              :min="0"
              :max="10"
              :step="1"
              style="width: 200px"
            />
            <span class="form-tip">默认3次</span>
          </el-form-item>

          <el-form-item label="重试间隔">
            <el-input
              v-model="retryDelaysText"
              placeholder="30000,60000,120000"
              style="width: 300px"
              @blur="parseRetryDelays"
            />
            <span class="form-tip">毫秒，用逗号分隔，默认30秒/60秒/120秒指数退避</span>
          </el-form-item>

          <el-form-item label="测试连通性">
            <el-button
              type="primary"
              @click="testWebhook"
              :loading="testingWebhook"
              :disabled="!alertConfig.webhookUrl"
            >
              发送测试消息
            </el-button>
          </el-form-item>

          <div v-if="webhookTestResult" class="test-result">
            <el-alert
              :title="webhookTestResult.success ? '测试成功' : '测试失败'"
              :type="webhookTestResult.success ? 'success' : 'error'"
              :closable="false"
            >
              <template #default>
                <div class="result-details">
                  <p v-if="webhookTestResult.status !== undefined">
                    <strong>状态码:</strong> {{ webhookTestResult.status }} {{ webhookTestResult.statusText || '' }}
                  </p>
                  <p v-if="webhookTestResult.responseTime !== undefined">
                    <strong>响应时间:</strong> {{ webhookTestResult.responseTime }}ms
                  </p>
                  <p v-if="webhookTestResult.error">
                    <strong>错误:</strong> {{ webhookTestResult.error }}
                  </p>
                  <div v-if="webhookTestResult.responseBody" class="response-body">
                    <strong>响应体:</strong>
                    <pre>{{ webhookTestResult.responseBody }}</pre>
                  </div>
                </div>
              </template>
            </el-alert>
          </div>
        </div>

        <el-form-item>
          <el-button type="primary" @click="saveAlertConfig" :loading="saving">
            保存配置
          </el-button>
          <el-button @click="loadAlertConfig">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-dialog v-model="showHeadersDialog" title="自定义请求头" width="600px">
      <el-form :model="headersForm" label-width="120px">
        <el-form-item
          v-for="(header, index) in headersForm.headers"
          :key="index"
          :label="`请求头 ${index + 1}`"
        >
          <div class="header-row">
            <el-input
              v-model="header.key"
              placeholder="Header Key"
              style="width: 200px; margin-right: 12px"
            />
            <el-input
              v-model="header.value"
              placeholder="Header Value"
              style="width: 200px; margin-right: 12px"
            />
            <el-button
              type="danger"
              link
              @click="removeHeader(index)"
              :disabled="headersForm.headers.length <= 1"
            >
              删除
            </el-button>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" link @click="addHeader">+ 添加请求头</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showHeadersDialog = false">取消</el-button>
        <el-button type="primary" @click="saveHeaders">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { reconciliationApi } from '../api';

const alertConfigFormRef = ref(null);
const saving = ref(false);
const testingWebhook = ref(false);
const webhookTestResult = ref(null);
const showHeadersDialog = ref(false);

const alertConfig = reactive({
  enabled: true,
  diffThreshold: 5,
  notificationMethods: ['internal'],
  webhookUrl: '',
  webhookHeaders: {},
  webhookTimeout: 5000,
  webhookMaxRetries: 3,
  webhookRetryDelays: [30000, 60000, 120000],
});

const headersForm = reactive({
  headers: [],
});

const retryDelaysText = computed({
  get: () => (alertConfig.webhookRetryDelays || []).join(','),
  set: (val) => {},
});

function parseRetryDelays() {
  const parts = retryDelaysText.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  if (parts.length > 0) {
    alertConfig.webhookRetryDelays = parts;
  }
}

async function loadAlertConfig() {
  try {
    const res = await reconciliationApi.getAlertConfig();
    if (res.success) {
      Object.assign(alertConfig, res.data);
      if (!alertConfig.webhookHeaders) alertConfig.webhookHeaders = {};
      if (!alertConfig.webhookRetryDelays) alertConfig.webhookRetryDelays = [30000, 60000, 120000];
    }
  } catch (e) {}
}

async function saveAlertConfig() {
  saving.value = true;
  try {
    const config = { ...alertConfig };
    if (!config.notificationMethods.includes('webhook')) {
      config.webhookUrl = '';
    }
    const res = await reconciliationApi.updateAlertConfig(config);
    if (res.success) {
      ElMessage.success('配置保存成功');
      webhookTestResult.value = null;
    }
  } finally {
    saving.value = false;
  }
}

function handleEnabledChange(val) {
  if (!val) {
    ElMessage.warning('对账告警已禁用');
  }
}

async function testWebhook() {
  if (!alertConfig.webhookUrl) {
    ElMessage.warning('请先填写WebHook URL');
    return;
  }

  testingWebhook.value = true;
  webhookTestResult.value = null;
  try {
    const res = await reconciliationApi.testWebhook({
      webhookUrl: alertConfig.webhookUrl,
      headers: alertConfig.webhookHeaders,
      timeout: alertConfig.webhookTimeout,
    });
    if (res.success) {
      webhookTestResult.value = res.data;
    }
  } finally {
    testingWebhook.value = false;
  }
}

function openHeadersDialog() {
  headersForm.headers = Object.entries(alertConfig.webhookHeaders || {}).map(([key, value]) => ({
    key,
    value,
  }));
  if (headersForm.headers.length === 0) {
    headersForm.headers.push({ key: '', value: '' });
  }
  showHeadersDialog.value = true;
}

function addHeader() {
  headersForm.headers.push({ key: '', value: '' });
}

function removeHeader(index) {
  headersForm.headers.splice(index, 1);
}

function saveHeaders() {
  const headers = {};
  for (const h of headersForm.headers) {
    if (h.key && h.key.trim()) {
      headers[h.key.trim()] = h.value || '';
    }
  }
  alertConfig.webhookHeaders = headers;
  showHeadersDialog.value = false;
  ElMessage.success('请求头已更新');
}

onMounted(() => {
  loadAlertConfig();
});
</script>

<style scoped>
.system-config-page {
  padding: 20px;
  height: 100%;
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

.config-card {
  max-width: 900px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.form-tip {
  margin-left: 12px;
  color: #909399;
  font-size: 13px;
}

.webhook-section {
  padding-top: 10px;
}

.section-title {
  margin: 0 0 20px 0;
  font-size: 15px;
  font-weight: 600;
  color: #409eff;
  padding-left: 10px;
  border-left: 3px solid #409eff;
}

.test-result {
  margin-top: 20px;
  max-width: 700px;
}

.result-details p {
  margin: 8px 0;
  color: #606266;
}

.response-body {
  margin-top: 12px;
}

.response-body pre {
  margin: 8px 0 0 0;
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.5;
  color: #606266;
}

.header-row {
  display: flex;
  align-items: center;
}
</style>
