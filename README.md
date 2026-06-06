# API平台多租户用量计量与账单管理系统

面向API平台的多租户用量计量与账单管理系统，包含计量引擎后端和运营管理前端界面。

## 功能特性

### 计量事件采集
- 高并发写入支持（单租户峰值5000次/秒）
- 异步写入，不阻塞API正常响应
- 批量提交（最多500条/次）
- 自动去重（相同租户+接口+毫秒级时间戳）

### 计量规则引擎
- 多维度计费：调用次数、数据传输量、计算时长
- 多维度叠加计费
- 阶梯定价支持（最多10级）
- 规则变更下一计费周期生效

### 用量聚合
- 三层聚合：分钟级（7天）→ 小时级（90天）→ 日级（永久）
- 最终一致性保证
- 延迟事件处理（最多5分钟）

### 配额管理
- 月度配额（按接口或全局）
- 配额类型：免费额度、套餐包含量、硬限制
- 原子扣减操作，防止超卖
- 阈值通知（80%、90%、95%、100%）

### 账单生成
- 每月1号自动生成上月账单
- 幂等生成，零账单支持
- 自动邮件通知

### 发票管理
- 按年度递增编号
- PDF导出支持
- 重复申请防护

### 前端管理界面
1. **运营Dashboard**：调用量趋势、活跃租户数、营收、Top10租户、告警列表
2. **租户管理**：租户列表、详情、配额配置、用量曲线
3. **计费规则配置**：多维度配置、阶梯定价可视化、变更历史
4. **账单管理**：账单列表、详情、CSV导出、重新生成
5. **用量查询**：多维度查询、图表/表格视图、数据导出

## 技术栈

### 后端
- Node.js + Fastify
- PostgreSQL 16 (业务数据)
- Redis 7 (配额计数、事件缓冲)
- Sequelize ORM
- Bull (异步队列)

### 前端
- Vue 3 + Vite
- Element Plus
- ECharts
- Pinia + Vue Router

### 部署
- Docker Compose
- Nginx (静态资源托管)

## 快速开始

### 方式一：Docker Compose 一键启动

```bash
# 克隆项目
git clone <repository-url>
cd api-metering

# 复制环境变量
cp .env.example .env

# 启动所有服务
docker-compose up -d

# 执行数据库迁移（添加新字段）
docker-compose exec backend node src/scripts/addContactPhoneColumn.js

# 初始化数据库（首次启动后执行）
docker-compose exec backend npm run init-db
```

访问地址：
- 前端界面: http://localhost:8080
- 后端API: http://localhost:3000
- 默认账号: admin / admin123

### 方式二：本地开发

#### 1. 启动依赖服务

```bash
docker-compose up -d postgres redis
```

#### 2. 后端启动

```bash
cd backend
npm install
cp .env.example .env
# 修改 .env 中数据库和Redis连接地址为 localhost
npm run init-db
npm run dev
```

#### 3. 前端启动

```bash
cd frontend
npm install
npm run dev
```

## 项目结构

```
api-metering/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── config/            # 配置文件
│   │   ├── models/            # 数据模型
│   │   ├── routes/            # API路由
│   │   ├── services/          # 业务服务
│   │   ├── utils/             # 工具函数
│   │   ├── scripts/           # 脚本
│   │   └── index.js           # 入口文件
│   └── package.json
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── api/               # API接口
│   │   ├── views/             # 页面组件
│   │   ├── components/        # 通用组件
│   │   ├── stores/            # Pinia状态
│   │   ├── router/            # 路由配置
│   │   └── main.js            # 入口文件
│   └── package.json
├── nginx/                      # Nginx配置
├── docker-compose.yml          # Docker编排
└── .env.example               # 环境变量示例
```

## API接口

### 认证接口
- `POST /api/auth/login` - 登录

### 仪表盘
- `GET /api/dashboard/stats` - 统计数据
- `GET /api/dashboard/call-trend` - 调用趋势
- `GET /api/dashboard/top-tenants` - Top租户
- `GET /api/dashboard/revenue-trend` - 营收趋势

### 租户管理
- `GET /api/tenants` - 租户列表
- `POST /api/tenants` - 创建租户
- `GET /api/tenants/:id` - 租户详情
- `PUT /api/tenants/:id` - 更新租户
- `GET /api/tenants/:id/quotas` - 租户配额
- `POST /api/tenants/:id/quotas` - 设置配额

### 计费规则
- `GET /api/rules` - 规则列表
- `POST /api/rules` - 创建规则
- `GET /api/rules/:id` - 规则详情
- `PUT /api/rules/:id` - 更新规则
- `GET /api/rules/:id/history` - 变更历史

### 账单管理
- `GET /api/bills` - 账单列表
- `GET /api/bills/:id` - 账单详情
- `POST /api/bills/generate` - 生成账单
- `POST /api/bills/:id/confirm` - 确认账单
- `GET /api/bills/export` - 导出CSV

### 发票管理
- `GET /api/invoices` - 发票列表
- `POST /api/invoices` - 申请开票
- `GET /api/invoices/:id/pdf` - 导出PDF

### 用量查询
- `GET /api/usage/query` - 用量查询
- `GET /api/usage/export` - 导出CSV
- `GET /api/usage/tenant/:id/current` - 当前用量

### 计量事件
- `POST /api/metering/events` - 提交事件（批量）
- `GET /api/metering/dead-letters` - 死信列表
- `POST /api/metering/dead-letters/:id/reprocess` - 重处理死信

## 核心业务规则

### 事件处理流程
1. API调用产生计量事件
2. 事件先写入Redis缓冲（最多30秒）
3. 异步批量持久化到PostgreSQL
4. 失败事件转入死信队列
5. 运营人员可手动重新入库

### 配额扣减
- 使用Redis Lua脚本实现原子操作
- Redis不可用时：
  - 硬限制配额：直接拒绝请求
  - 其他配额：允许短暂超额，后续对账修正

### 账单生成
- 每月1号凌晨自动触发
- 死信队列非空时账单标记为"待确认"
- 运营人员确认后变为"已确认"

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| NODE_ENV | 运行环境 | development |
| PORT | 后端端口 | 3000 |
| DATABASE_URL | 数据库连接 | postgresql://... |
| REDIS_URL | Redis连接 | redis://... |
| JWT_SECRET | JWT密钥 | - |
| SMTP_HOST | SMTP服务器 | - |
| SMTP_PORT | SMTP端口 | 587 |
| SMTP_USER | SMTP用户名 | - |
| SMTP_PASS | SMTP密码 | - |
| TAX_RATE | 税率 | 0 |

## 数据保留策略

| 数据类型 | 粒度 | 保留时间 |
|---------|------|---------|
| 计量事件明细 | 原始 | 永久 |
| 用量聚合 | 分钟级 | 7天 |
| 用量聚合 | 小时级 | 90天 |
| 用量聚合 | 日级 | 永久 |
| 账单数据 | - | 永久 |
| 发票数据 | - | 永久 |

## License

MIT
