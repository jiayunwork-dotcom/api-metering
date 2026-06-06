<template>
  <div class="tenant-detail-container">
    <div class="page-header">
      <el-button :icon="ArrowLeft" link @click="router.back()">返回</el-button>
      <h2 class="page-title">租户详情 - {{ tenant.name }}</h2>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="基本信息" name="basic">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-card shadow="hover" class="info-card">
              <template #header>基本信息</template>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="租户ID">{{ tenant.id }}</el-descriptions-item>
                <el-descriptions-item label="租户编码">{{ tenant.code }}</el-descriptions-item>
                <el-descriptions-item label="租户名称">{{ tenant.name }}</el-descriptions-item>
                <el-descriptions-item label="管理员邮箱">{{ tenant.email }}</el-descriptions-item>
                <el-descriptions-item label="联系电话">{{ tenant.phone }}</el-descriptions-item>
                <el-descriptions-item label="公司名称">{{ tenant.companyName || '-' }}</el-descriptions-item>
                <el-descriptions-item label="公司税号">{{ tenant.taxNumber || '-' }}</el-descriptions-item>
                <el-descriptions-item label="公司地址">{{ tenant.address || '-' }}</el-descriptions-item>
                <el-descriptions-item label="状态">
                  <el-tag :type="tenant.status === 'active' ? 'success' : 'info'">
                    {{ tenant.status === 'active' ? '正常' : '停用' }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="创建时间">{{ formatDate(tenant.createdAt) }}</el-descriptions-item>
                <el-descriptions-item label="备注">{{ tenant.remark || '-' }}</el-descriptions-item>
              </el-descriptions>
            </el-card>
          </el-col>

          <el-col :span="16">
            <el-card shadow="hover" class="quota-card">
              <template #header>
                <div class="card-header-flex">
                  <span>配额管理</span>
                  <el-button type="primary" size="small" :icon="Plus" @click="handleAddQuota">新增配额</el-button>
                </div>
              </template>
              <el-table :data="quotas" v-loading="quotaLoading">
                <el-table-column label="类型" width="100">
                  <template #default="{ row }">
                    <el-tag :type="getQuotaTypeColor(row.type)" size="small">
                      {{ getQuotaTypeLabel(row.type) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="范围" width="120">
                  <template #default="{ row }">
                    {{ row.scope === 'global' ? '全局' : row.apiInterface?.name || '-' }}
                  </template>
                </el-table-column>
                <el-table-column label="额度" width="100" align="right">
                  <template #default="{ row }">
                    {{ formatQuotaValue(row) }}
                  </template>
                </el-table-column>
                <el-table-column label="已使用" width="100" align="right">
                  <template #default="{ row }">
                    {{ formatQuotaValue(row, row.used) }}
                  </template>
                </el-table-column>
                <el-table-column label="使用进度">
                  <template #default="{ row }">
                    <el-progress
                      :percentage="Math.min(Math.round((row.used / row.limit) * 100), 100)"
                      :color="getQuotaColor(row.used / row.limit)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="计费周期" width="100">
                  <template #default="{ row }">
                    {{ row.period === 'monthly' ? '月度' : row.period }}
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="80" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                      {{ row.status === 'active' ? '生效' : '停用' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" align="center">
                  <template #default="{ row }">
                    <el-button type="primary" link size="small" @click="handleEditQuota(row)">编辑</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header-flex">
                  <span>本月用量趋势</span>
                  <el-select v-model="usageApiId" placeholder="选择API" clearable style="width: 200px" size="small">
                    <el-option
                      v-for="api in apiInterfaces"
                      :key="api.id"
                      :label="api.name"
                      :value="api.id"
                    />
                  </el-select>
                </div>
              </template>
              <div ref="usageChartRef" class="chart"></div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>历史账单</template>
              <el-table :data="bills" v-loading="billLoading">
                <el-table-column prop="billNo" label="账单编号" width="160" />
                <el-table-column prop="billingMonth" label="账期" width="120" />
                <el-table-column prop="totalAmount" label="总金额(元)" width="120" align="right">
                  <template #default="{ row }">
                    {{ row.totalAmount.toFixed(2) }}
                  </template>
                </el-table-column>
                <el-table-column prop="paidAmount" label="已付金额(元)" width="120" align="right">
                  <template #default="{ row }">
                    {{ row.paidAmount.toFixed(2) }}
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100" align="center">
                  <template #default="{ row }">
                    <el-tag :type="getBillStatusType(row.status)" size="small">
                      {{ getBillStatusLabel(row.status) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="createdAt" label="生成时间" width="180">
                  <template #default="{ row }">
                    {{ formatDate(row.createdAt) }}
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" align="center">
                  <template #default="{ row }">
                    <el-button type="primary" link size="small" @click="router.push(`/bills/${row.id}`)">详情</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <el-tab-pane label="预警与限流" name="alerts">
        <el-row :gutter="20">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header-flex">
                  <span>当前状态</span>
                </div>
              </template>
              <div class="status-overview">
                <div class="status-item" v-for="item in statusSummary" :key="item.key">
                  <el-tag :type="item.type" size="large" effect="dark">
                    <span class="status-label">{{ item.label }}</span>
                    <span class="status-count">{{ item.count }}</span>
                  </el-tag>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header-flex">
                  <span>限流与熔断状态</span>
                </div>
              </template>
              <el-table :data="circuitBreakers" v-loading="statusLoading">
                <el-table-column label="接口" prop="apiInterfaceName" />
                <el-table-column label="状态" width="120">
                  <template #default="{ row }">
                    <el-tag v-if="row.state === 'open'" type="danger" size="small">熔断中</el-tag>
                    <el-tag v-else-if="row.state === 'half_open'" type="warning" size="small">半开</el-tag>
                    <el-tag v-else type="success" size="small">正常</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="触发规则" prop="ruleName" />
                <el-table-column label="开始时间" width="180">
                  <template #default="{ row }">
                    {{ formatDate(row.openedAt) }}
                  </template>
                </el-table-column>
                <el-table-column label="剩余时间(秒)" width="140" align="right">
                  <template #default="{ row }">
                    <span v-if="row.remainingTime !== null">{{ row.remainingTime }}</span>
                    <span v-else>-</span>
                  </template>
                </el-table-column>
                <el-table-column label="半开统计" width="150">
                  <template #default="{ row }">
                    <span v-if="row.state === 'half_open'">
                      成功: {{ row.successCount }}, 失败: {{ row.failureCount }}
                    </span>
                    <span v-else>-</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="120" align="center">
                  <template #default="{ row }">
                    <el-button
                      v-if="row.state !== 'closed'"
                      type="primary"
                      size="small"
                      @click="handleCloseCircuit(row)"
                    >
                      手动解除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header-flex">
                  <span>预警规则</span>
                  <div>
                    <el-button type="primary" size="small" :icon="Plus" @click="handleAddAlertRule">新增规则</el-button>
                    <el-button size="small" :icon="Refresh" @click="loadAlertStatus">刷新</el-button>
                  </div>
                </div>
              </template>
              <el-table
                :data="alertRules"
                v-loading="rulesLoading"
                row-key="id"
                @sort-change="handleRuleSortChange"
              >
                <el-table-column label="优先级" width="80" align="center">
                  <template #default="{ row, $index }">
                    <el-button
                      v-if="alertRules.length > 1"
                      :icon="Sort"
                      text
                      size="small"
                      @mousedown="startDrag($event, row)"
                      style="cursor: move"
                    />
                    <span>{{ row.priority }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="规则名称" prop="name" />
                <el-table-column label="触发条件" width="180">
                  <template #default="{ row }">
                    {{ getConditionLabel(row) }}
                  </template>
                </el-table-column>
                <el-table-column label="阈值" width="120" align="right">
                  <template #default="{ row }">
                    {{ row.conditionConfig.threshold }} {{ row.conditionConfig.unit }}
                  </template>
                </el-table-column>
                <el-table-column label="通知方式" width="150">
                  <template #default="{ row }">
                    <el-tag
                      v-for="method in row.notificationMethods"
                      :key="method"
                      size="small"
                      style="margin-right: 4px"
                    >
                      {{ getNotificationLabel(method) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="执行动作" width="120">
                  <template #default="{ row }">
                    <el-tag :type="getActionType(row.actionType)" size="small">
                      {{ getActionLabel(row.actionType) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="适用范围" width="120">
                  <template #default="{ row }">
                    {{ row.apiInterface?.name || '全局' }}
                  </template>
                </el-table-column>
                <el-table-column label="最近触发" width="180">
                  <template #default="{ row }">
                    {{ formatDate(row.lastTriggeredAt) }}
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="80" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                      {{ row.status === 'active' ? '启用' : '停用' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="200" align="center" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" link size="small" @click="handleEditAlertRule(row)">编辑</el-button>
                    <el-button type="danger" link size="small" @click="handleDeleteAlertRule(row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header-flex">
                  <span>触发记录</span>
                </div>
              </template>
              <el-table :data="triggerHistory" v-loading="historyLoading">
                <el-table-column label="触发时间" width="180">
                  <template #default="{ row }">
                    {{ formatDate(row.triggeredAt) }}
                  </template>
                </el-table-column>
                <el-table-column label="规则名称">
                  <template #default="{ row }">
                    {{ row.alertRule?.name }}
                  </template>
                </el-table-column>
                <el-table-column label="触发原因" width="250">
                  <template #default="{ row }">
                    当前值: {{ row.currentValue }} {{ row.unit }}, 阈值: {{ row.thresholdValue }} {{ row.unit }}
                  </template>
                </el-table-column>
                <el-table-column label="执行动作" width="120">
                  <template #default="{ row }">
                    <el-tag :type="getActionType(row.actionType)" size="small">
                      {{ getActionLabel(row.actionType) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="适用接口" width="150">
                  <template #default="{ row }">
                    {{ row.apiInterface?.name || '全局' }}
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <el-tab-pane label="Webhook配置" name="webhook">
        <el-row :gutter="20">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header-flex">
                  <span>Webhook回调配置</span>
                  <el-button type="primary" size="small" :icon="Plus" @click="handleAddWebhook">新增Webhook</el-button>
                </div>
              </template>
              <el-table :data="webhooks" v-loading="webhookLoading">
                <el-table-column label="名称" prop="name" />
                <el-table-column label="URL" prop="url" show-overflow-tooltip />
                <el-table-column label="方法" width="100" prop="method" />
                <el-table-column label="超时(ms)" width="100" align="right">
                  <template #default="{ row }">
                    {{ row.timeout }}
                  </template>
                </el-table-column>
                <el-table-column label="重试次数" width="100" align="right">
                  <template #default="{ row }">
                    {{ row.maxRetries }}
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                      {{ row.status === 'active' ? '启用' : '停用' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="最后成功" width="180">
                  <template #default="{ row }">
                    {{ formatDate(row.lastSuccessAt) }}
                  </template>
                </el-table-column>
                <el-table-column label="最后失败" width="180">
                  <template #default="{ row }">
                    <el-tooltip v-if="row.lastError" :content="row.lastError" placement="top">
                      <span>{{ formatDate(row.lastFailureAt) }}</span>
                    </el-tooltip>
                    <span v-else>{{ formatDate(row.lastFailureAt) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="200" align="center" fixed="right">
                  <template #default="{ row }">
                    <el-button type="success" link size="small" @click="handleTestWebhook(row)">测试</el-button>
                    <el-button type="primary" link size="small" @click="handleEditWebhook(row)">编辑</el-button>
                    <el-button type="danger" link size="small" @click="handleDeleteWebhook(row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="alertRuleDialogVisible"
      :title="isEditAlertRule ? '编辑预警规则' : '新增预警规则'"
      width="600px"
    >
      <el-form :model="alertRuleForm" :rules="alertRuleRules" ref="alertRuleFormRef" label-width="120px">
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="alertRuleForm.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="规则描述">
          <el-input v-model="alertRuleForm.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-form-item label="适用接口" prop="apiInterfaceId">
          <el-select v-model="alertRuleForm.apiInterfaceId" style="width: 100%">
            <el-option label="全局" :value="null" />
            <el-option
              v-for="api in apiInterfaces"
              :key="api.id"
              :label="api.name"
              :value="api.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="触发条件" prop="conditionType">
          <el-select v-model="alertRuleForm.conditionType" style="width: 100%" @change="handleConditionTypeChange">
            <el-option label="当日调用量" value="daily_call_count" />
            <el-option label="当小时数据量" value="hourly_data_volume" />
            <el-option label="当月费用" value="monthly_cost" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="阈值" prop="conditionConfig.threshold">
          <el-input-number v-model="alertRuleForm.conditionConfig.threshold" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="alertRuleForm.conditionConfig.unit" style="width: 100%" />
        </el-form-item>
        <el-form-item label="通知方式" prop="notificationMethods">
          <el-checkbox-group v-model="alertRuleForm.notificationMethods">
            <el-checkbox label="internal">站内消息</el-checkbox>
            <el-checkbox label="email">邮件</el-checkbox>
            <el-checkbox label="webhook">Webhook</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="执行动作" prop="actionType">
          <el-select v-model="alertRuleForm.actionType" style="width: 100%" @change="handleActionTypeChange">
            <el-option label="仅通知" value="notify_only" />
            <el-option label="限速" value="rate_limit" />
            <el-option label="熔断" value="circuit_break" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="alertRuleForm.actionType === 'rate_limit'" label="QPS限制" prop="actionConfig.qps">
          <el-input-number v-model="alertRuleForm.actionConfig.qps" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="alertRuleForm.actionType === 'rate_limit'" label="突发流量" prop="actionConfig.burst">
          <el-input-number v-model="alertRuleForm.actionConfig.burst" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="alertRuleForm.actionType === 'circuit_break'" label="冷却期(分钟)" prop="cooldownPeriod">
          <el-input-number v-model="alertRuleForm.cooldownPeriod" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-switch v-model="alertRuleForm.status" active-value="active" inactive-value="disabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="alertRuleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitAlertRule">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="webhookDialogVisible"
      :title="isEditWebhook ? '编辑Webhook' : '新增Webhook'"
      width="500px"
    >
      <el-form :model="webhookForm" :rules="webhookRules" ref="webhookFormRef" label-width="100px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="webhookForm.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="URL" prop="url">
          <el-input v-model="webhookForm.url" maxlength="500" placeholder="https://example.com/webhook" />
        </el-form-item>
        <el-form-item label="请求方法">
          <el-select v-model="webhookForm.method" style="width: 100%">
            <el-option label="POST" value="POST" />
            <el-option label="GET" value="GET" />
            <el-option label="PUT" value="PUT" />
          </el-select>
        </el-form-item>
        <el-form-item label="超时(毫秒)">
          <el-input-number v-model="webhookForm.timeout" :min="1000" :max="30000" :step="1000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="最大重试次数">
          <el-input-number v-model="webhookForm.maxRetries" :min="0" :max="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="webhookForm.status" active-value="active" inactive-value="disabled" />
        </el-form-item>
        <el-form-item label="请求头">
          <el-input v-model="webhookHeadersText" type="textarea" :rows="3" placeholder='{"Authorization": "Bearer token"}' />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="webhookDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitWebhook">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="quotaDialogVisible"
      :title="isEditQuota ? '编辑配额' : '新增配额'"
      width="500px"
    >
      <el-form :model="quotaForm" :rules="quotaRules" ref="quotaFormRef" label-width="100px">
        <el-form-item label="配额类型" prop="type">
          <el-select v-model="quotaForm.type" style="width: 100%">
            <el-option label="免费额度" value="free" />
            <el-option label="套餐包含" value="package" />
            <el-option label="硬限制" value="hard_limit" />
          </el-select>
        </el-form-item>
        <el-form-item label="适用范围" prop="scope">
          <el-select v-model="quotaForm.scope" style="width: 100%">
            <el-option label="全局" value="global" />
            <el-option label="指定API" value="api" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="quotaForm.scope === 'api'" label="API接口" prop="apiInterfaceId">
          <el-select v-model="quotaForm.apiInterfaceId" style="width: 100%">
            <el-option
              v-for="api in apiInterfaces"
              :key="api.id"
              :label="api.name"
              :value="api.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="计量单位" prop="unit">
          <el-select v-model="quotaForm.unit" style="width: 100%">
            <el-option label="调用次数" value="calls" />
            <el-option label="数据量(MB)" value="data_mb" />
            <el-option label="计算时长(秒)" value="compute_seconds" />
          </el-select>
        </el-form-item>
        <el-form-item label="额度" prop="limit">
          <el-input-number v-model="quotaForm.limit" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="计费周期" prop="period">
          <el-select v-model="quotaForm.period" style="width: 100%">
            <el-option label="月度" value="monthly" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quotaDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitQuota">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Plus, Refresh, Sort } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { tenantApi, ruleApi, billingApi, usageApi, alertApi } from '../api';

const route = useRoute();
const router = useRouter();

const tenantId = route.params.id;
const tenant = ref({});
const quotas = ref([]);
const bills = ref([]);
const apiInterfaces = ref([]);
const usageApiId = ref('');

const activeTab = ref('basic');

const quotaLoading = ref(false);
const billLoading = ref(false);
const submitting = ref(false);
const quotaDialogVisible = ref(false);
const isEditQuota = ref(false);
const quotaFormRef = ref();

const alertRules = ref([]);
const triggerHistory = ref([]);
const circuitBreakers = ref([]);
const webhooks = ref([]);
const rulesLoading = ref(false);
const historyLoading = ref(false);
const statusLoading = ref(false);
const webhookLoading = ref(false);

const alertRuleDialogVisible = ref(false);
const isEditAlertRule = ref(false);
const alertRuleFormRef = ref();

const webhookDialogVisible = ref(false);
const isEditWebhook = ref(false);
const webhookFormRef = ref();
const webhookHeadersText = ref('');

const usageChartRef = ref();
let usageChart = null;
let statusRefreshTimer = null;

const statusSummary = computed(() => {
  const normal = apiInterfaces.value.length + 1 - circuitBreakers.value.length;
  const rateLimited = 0;
  const open = circuitBreakers.value.filter(c => c.state === 'open').length;
  const halfOpen = circuitBreakers.value.filter(c => c.state === 'half_open').length;

  return [
    { key: 'normal', label: '正常', count: normal, type: 'success' },
    { key: 'rate_limited', label: '限速中', count: rateLimited, type: 'warning' },
    { key: 'half_open', label: '半开', count: halfOpen, type: 'warning' },
    { key: 'open', label: '熔断中', count: open, type: 'danger' },
  ];
});

const quotaForm = reactive({
  id: null,
  type: 'free',
  scope: 'global',
  apiInterfaceId: null,
  unit: 'calls',
  limit: 10000,
  period: 'monthly',
  status: 'active',
});

const quotaRules = {
  type: [{ required: true, message: '请选择配额类型', trigger: 'change' }],
  scope: [{ required: true, message: '请选择适用范围', trigger: 'change' }],
  apiInterfaceId: [{ required: true, message: '请选择API接口', trigger: 'change' }],
  unit: [{ required: true, message: '请选择计量单位', trigger: 'change' }],
  limit: [{ required: true, message: '请输入额度', trigger: 'blur' }],
  period: [{ required: true, message: '请选择计费周期', trigger: 'change' }],
};

const alertRuleForm = reactive({
  id: null,
  name: '',
  description: '',
  priority: 1,
  conditionType: 'daily_call_count',
  conditionConfig: {
    threshold: 1000,
    unit: '次',
  },
  notificationMethods: ['internal'],
  actionType: 'notify_only',
  actionConfig: {
    qps: 10,
    burst: 20,
  },
  apiInterfaceId: null,
  cooldownPeriod: 30,
  status: 'active',
});

const alertRuleRules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  conditionType: [{ required: true, message: '请选择触发条件', trigger: 'change' }],
  actionType: [{ required: true, message: '请选择执行动作', trigger: 'change' }],
  notificationMethods: [{ required: true, message: '请选择通知方式', trigger: 'change' }],
  'conditionConfig.threshold': [{ required: true, message: '请输入阈值', trigger: 'blur' }],
};

const webhookForm = reactive({
  id: null,
  name: '',
  url: '',
  method: 'POST',
  headers: {},
  timeout: 5000,
  maxRetries: 3,
  retryDelays: [10000, 30000, 60000],
  status: 'active',
});

const webhookRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  url: [{ required: true, message: '请输入URL', trigger: 'blur' }],
};

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleString('zh-CN') : '-';
}

function getQuotaTypeColor(type) {
  const colors = { free: 'success', package: 'primary', hard_limit: 'danger' };
  return colors[type] || 'info';
}

function getQuotaTypeLabel(type) {
  const labels = { free: '免费', package: '套餐', hard_limit: '硬限制' };
  return labels[type] || type;
}

function getQuotaColor(ratio) {
  if (ratio >= 0.95) return '#F56C6C';
  if (ratio >= 0.8) return '#E6A23C';
  return '#67C23A';
}

function formatQuotaValue(row, value) {
  const val = value !== undefined ? value : row.limit;
  if (row.unit === 'data_mb') return val + ' MB';
  if (row.unit === 'compute_seconds') return val + ' 秒';
  return val + ' 次';
}

function getBillStatusType(status) {
  const types = {
    draft: 'info',
    pending_confirmation: 'warning',
    confirmed: 'success',
    paid: 'success',
    overdue: 'danger',
    cancelled: 'info',
  };
  return types[status] || 'info';
}

function getBillStatusLabel(status) {
  const labels = {
    draft: '草稿',
    pending_confirmation: '待确认',
    confirmed: '已确认',
    paid: '已支付',
    overdue: '已逾期',
    cancelled: '已取消',
  };
  return labels[status] || status;
}

function getConditionLabel(row) {
  const labels = {
    daily_call_count: '当日调用量',
    hourly_data_volume: '当小时数据量',
    monthly_cost: '当月费用',
    custom: '自定义',
  };
  return labels[row.conditionType] || row.conditionType;
}

function getNotificationLabel(method) {
  const labels = { internal: '站内', email: '邮件', webhook: 'Webhook' };
  return labels[method] || method;
}

function getActionType(actionType) {
  const types = {
    notify_only: 'info',
    rate_limit: 'warning',
    circuit_break: 'danger',
  };
  return types[actionType] || 'info';
}

function getActionLabel(actionType) {
  const labels = {
    notify_only: '仅通知',
    rate_limit: '限速',
    circuit_break: '熔断',
  };
  return labels[actionType] || actionType;
}

async function loadTenantDetail() {
  try {
    const res = await tenantApi.getDetail(tenantId);
    if (res.success) {
      tenant.value = res.data;
    }
  } catch (e) {}
}

async function loadQuotas() {
  quotaLoading.value = true;
  try {
    const res = await tenantApi.getQuotas(tenantId);
    if (res.success) {
      quotas.value = res.data || [];
    }
  } finally {
    quotaLoading.value = false;
  }
}

async function loadBills() {
  billLoading.value = true;
  try {
    const res = await billingApi.getBills({ tenantId, pageSize: 100 });
    if (res.success) {
      bills.value = res.data || [];
    }
  } finally {
    billLoading.value = false;
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

async function loadUsageTrend() {
  try {
    const res = await usageApi.getTenantCurrent(tenantId, {
      apiInterfaceId: usageApiId.value,
      aggregate: 'day',
    });
    if (res.success) {
      renderUsageChart(res.data.dates, res.data.usage);
    }
  } catch (e) {}
}

function renderUsageChart(dates, data) {
  if (!usageChartRef.value) return;

  if (!usageChart) {
    usageChart = echarts.init(usageChartRef.value);
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>调用量: {c}次',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
    },
    yAxis: {
      type: 'value',
      name: '调用量',
    },
    series: [{
      name: '调用量',
      type: 'line',
      smooth: true,
      data: data,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(103, 194, 58, 0.5)' },
          { offset: 1, color: 'rgba(103, 194, 58, 0.1)' },
        ]),
      },
      lineStyle: {
        color: '#67C23A',
        width: 2,
      },
      itemStyle: { color: '#67C23A' },
    }],
  };

  usageChart.setOption(option);
}

async function loadAlertRules() {
  rulesLoading.value = true;
  try {
    const res = await alertApi.getRules(tenantId);
    if (res.success) {
      alertRules.value = res.data || [];
    }
  } finally {
    rulesLoading.value = false;
  }
}

async function loadTriggerHistory() {
  historyLoading.value = true;
  try {
    const res = await alertApi.getHistory(tenantId, { limit: 20 });
    if (res.success) {
      triggerHistory.value = res.data || [];
    }
  } finally {
    historyLoading.value = false;
  }
}

async function loadCircuitBreakers() {
  statusLoading.value = true;
  try {
    const res = await alertApi.getCircuitBreakerStatus(tenantId);
    if (res.success) {
      circuitBreakers.value = res.data || [];
    }
  } finally {
    statusLoading.value = false;
  }
}

async function loadWebhooks() {
  webhookLoading.value = true;
  try {
    const res = await alertApi.getWebhooks(tenantId);
    if (res.success) {
      webhooks.value = res.data || [];
    }
  } finally {
    webhookLoading.value = false;
  }
}

async function loadAlertStatus() {
  await Promise.all([
    loadAlertRules(),
    loadTriggerHistory(),
    loadCircuitBreakers(),
  ]);
}

function handleAddQuota() {
  isEditQuota.value = false;
  Object.assign(quotaForm, {
    id: null,
    type: 'free',
    scope: 'global',
    apiInterfaceId: null,
    unit: 'calls',
    limit: 10000,
    period: 'monthly',
    status: 'active',
  });
  quotaDialogVisible.value = true;
}

function handleEditQuota(row) {
  isEditQuota.value = true;
  Object.assign(quotaForm, row);
  quotaForm.apiInterfaceId = row.apiInterfaceId;
  quotaDialogVisible.value = true;
}

async function handleSubmitQuota() {
  if (!quotaFormRef.value) return;

  await quotaFormRef.value.validate(async (valid) => {
    if (!valid) return;

    submitting.value = true;
    try {
      const res = isEditQuota.value
        ? await tenantApi.updateQuota(tenantId, quotaForm.id, quotaForm)
        : await tenantApi.createQuota(tenantId, quotaForm);

      if (res.success) {
        ElMessage.success(isEditQuota.value ? '修改成功' : '创建成功');
        quotaDialogVisible.value = false;
        loadQuotas();
      }
    } finally {
      submitting.value = false;
    }
  });
}

function handleConditionTypeChange() {
  const unitMap = {
    daily_call_count: '次',
    hourly_data_volume: 'MB',
    monthly_cost: '元',
    custom: '',
  };
  alertRuleForm.conditionConfig.unit = unitMap[alertRuleForm.conditionType] || '';
}

function handleActionTypeChange() {
  if (alertRuleForm.actionType === 'rate_limit') {
    if (!alertRuleForm.actionConfig) {
      alertRuleForm.actionConfig = {};
    }
    alertRuleForm.actionConfig.qps = alertRuleForm.actionConfig.qps || 10;
    alertRuleForm.actionConfig.burst = alertRuleForm.actionConfig.burst || 20;
  }
}

function handleAddAlertRule() {
  isEditAlertRule.value = false;
  Object.assign(alertRuleForm, {
    id: null,
    name: '',
    description: '',
    priority: 1,
    conditionType: 'daily_call_count',
    conditionConfig: {
      threshold: 1000,
      unit: '次',
    },
    notificationMethods: ['internal'],
    actionType: 'notify_only',
    actionConfig: {
      qps: 10,
      burst: 20,
    },
    apiInterfaceId: null,
    cooldownPeriod: 30,
    status: 'active',
  });
  alertRuleDialogVisible.value = true;
}

function handleEditAlertRule(row) {
  isEditAlertRule.value = true;
  Object.assign(alertRuleForm, JSON.parse(JSON.stringify(row)));
  alertRuleForm.conditionConfig = row.conditionConfig || { threshold: 1000, unit: '次' };
  alertRuleForm.actionConfig = row.actionConfig || { qps: 10, burst: 20 };
  alertRuleDialogVisible.value = true;
}

async function handleSubmitAlertRule() {
  if (!alertRuleFormRef.value) return;

  await alertRuleFormRef.value.validate(async (valid) => {
    if (!valid) return;

    submitting.value = true;
    try {
      const res = isEditAlertRule.value
        ? await alertApi.updateRule(tenantId, alertRuleForm.id, alertRuleForm)
        : await alertApi.createRule(tenantId, alertRuleForm);

      if (res.success) {
        ElMessage.success(isEditAlertRule.value ? '修改成功' : '创建成功');
        alertRuleDialogVisible.value = false;
        loadAlertRules();
      }
    } finally {
      submitting.value = false;
    }
  });
}

async function handleDeleteAlertRule(row) {
  try {
    await ElMessageBox.confirm('确定要删除这条预警规则吗？', '删除确认', {
      type: 'warning',
    });

    const res = await alertApi.deleteRule(tenantId, row.id);
    if (res.success) {
      ElMessage.success('删除成功');
      loadAlertRules();
    }
  } catch {
  }
}

async function handleRuleSortChange({ newIndex, oldIndex) {
  if (newIndex === oldIndex) return;

  const newOrder = [...alertRules.value];
  const [removed] = newOrder.splice(oldIndex, 1);
  newOrder.splice(newIndex, 0, removed);

  const orderedIds = newOrder.map(r => r.id);
  try {
    await alertApi.reorderRules(tenantId, orderedIds);
    ElMessage.success('优先级已更新');
    loadAlertRules();
  } catch (e) {
  }
}

let draggedRow = null;

function startDrag(event, row) {
  draggedRow = row;
}

async function handleCloseCircuit(row) {
  try {
    await ElMessageBox.confirm('确定要手动解除熔断吗？', '解除确认', {
      type: 'warning',
    });

    const res = await alertApi.closeCircuitBreaker(tenantId, {
      apiInterfaceId: row.apiInterfaceId,
    });

    if (res.success) {
      ElMessage.success(res.message || '已解除熔断');
      loadCircuitBreakers();
    }
  } catch {
  }
}

function handleAddWebhook() {
  isEditWebhook.value = false;
  Object.assign(webhookForm, {
    id: null,
    name: '',
    url: '',
    method: 'POST',
    headers: {},
    timeout: 5000,
    maxRetries: 3,
    retryDelays: [10000, 30000, 60000],
    status: 'active',
  });
  webhookHeadersText.value = '';
  webhookDialogVisible.value = true;
}

function handleEditWebhook(row) {
  isEditWebhook.value = true;
  Object.assign(webhookForm, JSON.parse(JSON.stringify(row)));
  webhookHeadersText.value = row.headers ? JSON.stringify(row.headers, null, 2) : '';
  webhookDialogVisible.value = true;
}

async function handleSubmitWebhook() {
  if (!webhookFormRef.value) return;

  await webhookFormRef.value.validate(async (valid) => {
    if (!valid) return;

    submitting.value = true;
    try {
      if (webhookHeadersText.value) {
        webhookForm.headers = JSON.parse(webhookHeadersText.value);
      }

      const res = isEditWebhook.value
        ? await alertApi.updateWebhook(tenantId, webhookForm.id, webhookForm)
        : await alertApi.createWebhook(tenantId, webhookForm);

      if (res.success) {
        ElMessage.success(isEditWebhook.value ? '修改成功' : '创建成功');
        webhookDialogVisible.value = false;
        loadWebhooks();
      }
    } catch (e) {
      ElMessage.error('请求头格式错误，请输入有效的JSON');
    } finally {
      submitting.value = false;
    }
  });
}

async function handleDeleteWebhook(row) {
  try {
    await ElMessageBox.confirm('确定要删除这个Webhook配置吗？', '删除确认', {
      type: 'warning',
    });

    const res = await alertApi.deleteWebhook(tenantId, row.id);
    if (res.success) {
      ElMessage.success('删除成功');
      loadWebhooks();
    }
  } catch {
  }
}

async function handleTestWebhook(row) {
  try {
    const res = await alertApi.testWebhook(tenantId, row.id);
    if (res.success) {
      ElMessage.success('测试成功');
    } else {
      ElMessage.error(res.data?.error || '测试失败');
    }
  } catch (e) {
  }
}

function handleResize() {
  usageChart?.resize();
}

function startStatusRefresh() {
  statusRefreshTimer = setInterval(() => {
    if (activeTab.value === 'alerts') {
      loadCircuitBreakers();
    }
  }, 5000);
}

onMounted(async () => {
  await Promise.all([
    loadTenantDetail(),
    loadQuotas(),
    loadBills(),
    loadApiInterfaces(),
    loadWebhooks(),
  ]);
  loadUsageTrend();
  loadAlertStatus();
  startStatusRefresh();

  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  usageChart?.dispose();
  if (statusRefreshTimer) {
    clearInterval(statusRefreshTimer);
  }
});
</script>

<style scoped>
.tenant-detail-container {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart {
  height: 300px;
  width: 100%;
}

.info-card {
  margin-bottom: 20px;
}

.status-overview {
  display: flex;
  gap: 20px;
  padding: 20px 0;
}

.status-item {
  flex: 1;
  text-align: center;
}

.status-item .el-tag {
  width: 100%;
  padding: 20px;
  font-size: 16px;
}

.status-label {
  display: block;
  margin-bottom: 8px;
}

.status-count {
  font-size: 32px;
  font-weight: bold;
  display: block;
}
</style>
