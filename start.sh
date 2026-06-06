#!/bin/bash

echo "=========================================="
echo "  API计量与账单管理系统 - 快速启动脚本"
echo "=========================================="
echo ""

echo "[1/5] 检查Docker环境..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker和Docker Compose"
    exit 1
fi
echo "✅ Docker环境正常"
echo ""

echo "[2/5] 复制环境变量配置..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ .env文件已创建"
else
    echo "ℹ️  .env文件已存在，跳过"
fi
echo ""

echo "[3/5] 构建并启动服务..."
docker-compose up -d --build
echo ""

echo "[4/5] 等待服务就绪..."
echo "⏳ 等待PostgreSQL启动..."
until docker-compose exec -T postgres pg_isready -U api_metering &> /dev/null; do
    sleep 2
done
echo "✅ PostgreSQL就绪"

echo "⏳ 等待Redis启动..."
until docker-compose exec -T redis redis-cli ping &> /dev/null; do
    sleep 2
done
echo "✅ Redis就绪"

echo "⏳ 等待后端服务启动..."
sleep 10
echo "✅ 服务就绪"
echo ""

echo "[5/5] 初始化数据库..."
docker-compose exec -T backend npm run init-db
echo ""

echo "=========================================="
echo "🎉 系统启动完成！"
echo "=========================================="
echo ""
echo "访问地址："
echo "  🌐 前端界面: http://localhost:8080"
echo "  🔌 后端API: http://localhost:3000"
echo ""
echo "默认账号："
echo "  👤 用户名: admin"
echo "  🔑 密码: admin123"
echo ""
echo "常用命令："
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo ""
