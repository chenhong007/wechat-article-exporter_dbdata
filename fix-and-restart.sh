#!/bin/bash

# 修复 502 Bad Gateway 错误的脚本
# 该脚本会修复目录权限、重新构建镜像并启动容器

set -e

echo "================================"
echo "开始修复 wechat-article-exporter"
echo "================================"

# 1. 停止并删除旧容器
echo ""
echo "[1/6] 停止并删除旧容器..."
docker stop wechat-exporter 2>/dev/null || true
docker rm wechat-exporter 2>/dev/null || true

# 2. 确保 data 目录存在并设置正确的权限
echo ""
echo "[2/6] 设置目录权限..."
cd /home/wechat-article-exporter

# 创建必要的目录
mkdir -p data/kv/cookie data/storage

# 设置权限 - node 用户的 UID 通常是 1000
# 如果不确定，可以用 777 (不推荐生产环境)
# 更好的方式是设置为 1000:1000 (node:node in Alpine)
chown -R 1000:1000 data/ 2>/dev/null || chmod -R 777 data/

ls -la data/

# 3. 清理旧的镜像缓存（可选）
echo ""
echo "[3/6] 清理旧镜像..."
docker images | grep wechat-article-exporter | grep -v latest | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true

# 4. 重新构建镜像
echo ""
echo "[4/6] 重新构建 Docker 镜像..."
docker compose build --no-cache

# 5. 启动容器
echo ""
echo "[5/6] 启动容器..."
docker compose up -d

# 6. 等待容器启动并查看日志
echo ""
echo "[6/6] 等待容器启动..."
sleep 5

echo ""
echo "================================"
echo "容器状态:"
echo "================================"
docker ps | grep wechat

echo ""
echo "================================"
echo "最新日志:"
echo "================================"
docker logs --tail 30 wechat-exporter

echo ""
echo "================================"
echo "检查 KV 目录:"
echo "================================"
docker exec wechat-exporter ls -la /app/.data/ || echo "无法访问容器内目录"

echo ""
echo "================================"
echo "测试 API 端点:"
echo "================================"
curl -I http://localhost:3000 2>&1 | head -10

echo ""
echo "================================"
echo "修复完成！"
echo "================================"
echo ""
echo "如果仍然有问题，请检查:"
echo "1. 日志: docker logs wechat-exporter"
echo "2. 容器内部: docker exec -it wechat-exporter sh"
echo "3. 权限: ls -la /home/wechat-article-exporter/data/"
