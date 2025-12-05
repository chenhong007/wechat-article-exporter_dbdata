#!/bin/bash

#############################################
# 快速部署脚本 - 适合频繁更新场景
#############################################
# 不清理缓存，使用 Docker 构建缓存加速
#############################################

set -e

cd /home/wechat-article-exporter

echo "🚀 快速部署模式"
echo "================================"

# 1. 停止容器
echo "⏸️  停止旧容器..."
docker stop wechat-exporter 2>/dev/null || true
docker rm wechat-exporter 2>/dev/null || true

# 2. 快速构建（使用缓存）
echo "🔨 构建镜像（使用缓存）..."
START_TIME=$(date +%s)
docker compose build
END_TIME=$(date +%s)
echo "✅ 构建完成 (耗时: $((END_TIME - START_TIME))s)"

# 3. 启动容器
echo "▶️  启动容器..."
docker compose up -d

# 4. 等待就绪
echo "⏳ 等待服务就绪..."
sleep 3

# 5. 显示状态
echo ""
echo "================================"
echo "📊 部署状态"
echo "================================"
docker ps | grep -E "CONTAINER|wechat"
echo ""
docker logs wechat-exporter --tail 10
echo ""
echo "✅ 部署完成！"
echo "🌐 访问: http://localhost:3000"
