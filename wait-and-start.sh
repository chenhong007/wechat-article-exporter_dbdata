#!/bin/bash

# 等待 Docker 构建完成后自动启动容器的脚本

set -e

cd /home/wechat-article-exporter

echo "====================================="
echo "等待 Docker 构建完成..."
echo "====================================="

# 等待构建完成（检查是否有 docker compose build 进程）
while pgrep -f "docker compose build" > /dev/null 2>&1 || pgrep -f "docker-compose build" > /dev/null 2>&1; do
    echo "$(date '+%H:%M:%S') - 构建中，请稍候..."
    sleep 10
done

echo ""
echo "====================================="
echo "✅ 构建完成！"
echo "====================================="
echo ""

# 检查镜像是否成功创建
if docker images | grep -q "wechat-article-exporter.*latest"; then
    echo "✅ 镜像创建成功"
    docker images | grep wechat-article-exporter | head -3
else
    echo "❌ 镜像创建失败，请检查构建日志"
    exit 1
fi

echo ""
echo "====================================="
echo "启动容器..."
echo "====================================="

# 启动容器
docker compose up -d

echo ""
echo "等待容器启动..."
sleep 5

echo ""
echo "====================================="
echo "容器状态："
echo "====================================="
docker ps | grep -E "CONTAINER|wechat"

echo ""
echo "====================================="
echo "容器日志（最后 30 行）："
echo "====================================="
docker logs wechat-exporter --tail 30

echo ""
echo "====================================="
echo "验证 KV 目录："
echo "====================================="
docker exec wechat-exporter ls -la /app/.data/ 2>&1 || echo "⚠️ 无法访问容器目录"

echo ""
echo "====================================="
echo "测试 API："
echo "====================================="
curl -I http://localhost:3000 2>&1 | head -10

echo ""
echo "====================================="
echo "✅ 启动完成！"
echo "====================================="
echo ""
echo "如需查看完整日志，运行："
echo "  docker logs -f wechat-exporter"
echo ""
echo "如需进入容器调试，运行："
echo "  docker exec -it wechat-exporter sh"
