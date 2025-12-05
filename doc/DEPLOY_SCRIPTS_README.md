# 自动部署脚本使用说明

## 📦 脚本列表

项目提供了三个部署脚本，适用于不同场景：

### 1. `auto-deploy.sh` - 完整自动部署 🚀

**功能最全的部署脚本**，包含完整的部署流程和验证。

**特点：**
- ✅ 检查 Docker 状态
- ✅ 检测代码变化（Git）
- ✅ 自动备份数据库
- ✅ 停止并清理旧容器
- ✅ 清理旧镜像
- ✅ 构建新镜像（无缓存）
- ✅ 启动容器
- ✅ 等待服务就绪
- ✅ 全面验证部署状态
- ✅ 彩色日志输出
- ✅ 错误自动回滚

**使用场景：**
- 生产环境部署
- 重要更新部署
- 需要完整验证的场景

**用法：**
```bash
cd /home/wechat-article-exporter
./auto-deploy.sh
```

---

### 2. `watch-and-deploy.sh` - 自动监控部署 👀

**自动监控文件变化**，检测到改动后自动触发部署。

**特点：**
- ✅ 实时监控文件变化
- ✅ 自动触发部署
- ✅ 防抖机制（避免频繁部署）
- ✅ 可配置监控目录
- ✅ 支持忽略特定文件
- ✅ 后台运行模式

**监控的目录/文件：**
- `server/` - 后端代码
- `pages/` - 页面
- `components/` - 组件
- `utils/` - 工具函数
- `nuxt.config.ts`
- `nitro.config.ts`
- `Dockerfile`
- `docker-compose.yml`

**使用场景：**
- 开发环境
- 需要频繁更新的场景
- 持续集成

**用法：**
```bash
# 基本用法
./watch-and-deploy.sh

# 设置 10 秒防抖时间
./watch-and-deploy.sh -d 10

# 测试模式（不实际部署）
./watch-and-deploy.sh -t

# 后台运行
nohup ./watch-and-deploy.sh > deploy-watch.log 2>&1 &
```

**停止监控：**
```bash
# 前台运行时按 Ctrl+C

# 后台运行时
pkill -f watch-and-deploy.sh
```

---

### 3. `quick-deploy.sh` - 快速部署 ⚡

**最快的部署方式**，使用 Docker 缓存加速构建。

**特点：**
- ✅ 极速部署（利用缓存）
- ✅ 简洁输出
- ✅ 适合频繁更新
- ✅ 不清理旧镜像

**使用场景：**
- 小改动快速验证
- 开发调试
- 频繁更新场景

**用法：**
```bash
./quick-deploy.sh
```

**速度对比：**
- 完整部署: 10-15 分钟
- 快速部署: 2-5 分钟（首次）
- 快速部署: 30-120 秒（有缓存）

---

## 🎯 推荐使用场景

| 场景 | 推荐脚本 | 说明 |
|------|---------|------|
| **生产环境部署** | `auto-deploy.sh` | 完整验证，确保稳定 |
| **开发环境** | `watch-and-deploy.sh` | 自动监控，提高效率 |
| **快速验证** | `quick-deploy.sh` | 最快速度，适合调试 |
| **首次部署** | `auto-deploy.sh` | 完整流程，避免遗漏 |
| **小改动测试** | `quick-deploy.sh` | 快速迭代 |

---

## 📖 详细用法示例

### 场景 1：首次部署或重大更新

```bash
cd /home/wechat-article-exporter

# 1. 确保代码已更新
git pull

# 2. 执行完整部署
./auto-deploy.sh

# 3. 查看日志（如果需要）
docker logs -f wechat-exporter
```

### 场景 2：开发环境持续更新

```bash
# 在一个终端启动监控
./watch-and-deploy.sh

# 在另一个终端正常开发
vim server/api/xxx.ts

# 保存文件后，监控脚本会自动触发部署
```

### 场景 3：快速测试小改动

```bash
# 修改代码
vim components/xxx.vue

# 快速部署
./quick-deploy.sh

# 查看效果
curl http://localhost:3000
```

---

## 🛠️ 高级配置

### 自定义监控目录

编辑 `watch-and-deploy.sh`：

```bash
WATCH_DIRS=(
    "$PROJECT_DIR/server"
    "$PROJECT_DIR/pages"
    # 添加更多目录
    "$PROJECT_DIR/my-custom-dir"
)
```

### 自定义防抖时间

```bash
# 默认 5 秒
./watch-and-deploy.sh -d 10  # 改为 10 秒
```

### 自定义忽略模式

编辑 `watch-and-deploy.sh`：

```bash
IGNORE_PATTERNS=(
    "*.log"
    "*.tmp"
    # 添加更多模式
    "*.test.ts"
    "*.spec.ts"
)
```

---

## 🔧 故障排查

### 问题 1: 脚本没有执行权限

```bash
chmod +x /home/wechat-article-exporter/*.sh
```

### 问题 2: inotify-tools 未安装

```bash
apt-get update && apt-get install -y inotify-tools
```

### 问题 3: Docker 构建失败

```bash
# 查看完整构建日志
cat /tmp/docker-build.log

# 手动构建排查
docker compose build --no-cache
```

### 问题 4: 容器启动失败

```bash
# 查看容器日志
docker logs wechat-exporter

# 检查端口占用
netstat -tlnp | grep 3000

# 检查数据目录权限
ls -la /home/wechat-article-exporter/data/
```

---

## 📊 性能对比

| 脚本 | 首次构建 | 有缓存 | 验证 | 备份 |
|------|---------|--------|------|------|
| `auto-deploy.sh` | 10-15 分钟 | 10-15 分钟 | ✅ 完整 | ✅ 是 |
| `quick-deploy.sh` | 10-15 分钟 | 30-120 秒 | ❌ 无 | ❌ 否 |
| `watch-and-deploy.sh` | 10-15 分钟 | 10-15 分钟 | ✅ 完整 | ✅ 是 |

---

## 🎨 脚本特性

### 彩色日志输出

```
[INFO]    - 普通信息（蓝色）
[SUCCESS] - 成功消息（绿色）
[WARNING] - 警告信息（黄色）
[ERROR]   - 错误信息（红色）
```

### 自动备份

`auto-deploy.sh` 会自动备份数据库到：
```
data/db.sqlite.backup-20251205-123456
```

### 错误回滚

如果部署失败，`auto-deploy.sh` 会：
1. 显示错误日志
2. 保留旧容器（如果可用）
3. 提示手动恢复步骤

---

## 📝 日志和调试

### 查看部署日志

```bash
# 实时查看容器日志
docker logs -f wechat-exporter

# 查看最后 100 行
docker logs wechat-exporter --tail 100

# 查看构建日志
cat /tmp/docker-build.log
```

### 进入容器调试

```bash
# 进入容器
docker exec -it wechat-exporter sh

# 查看目录结构
ls -la /app/.data/

# 查看环境变量
env | grep NITRO
```

---

## 🚀 最佳实践

1. **生产环境：** 使用 `auto-deploy.sh`，确保完整验证
2. **开发环境：** 使用 `watch-and-deploy.sh`，自动化部署
3. **快速测试：** 使用 `quick-deploy.sh`，提高效率
4. **部署前：** 先在本地测试，确保代码无误
5. **定期清理：** 清理旧的备份和镜像文件

```bash
# 清理旧备份（保留最近 5 个）
ls -t data/db.sqlite.backup-* | tail -n +6 | xargs rm -f

# 清理旧镜像
docker image prune -a
```

---

## 📞 获取帮助

```bash
# 查看脚本帮助
./watch-and-deploy.sh --help

# 测试模式（不实际部署）
./watch-and-deploy.sh --test
```

---

## ⚠️ 注意事项

1. **数据安全：** 部署前确保数据已备份
2. **权限问题：** 确保脚本有执行权限
3. **端口冲突：** 确保 3000 端口未被占用
4. **磁盘空间：** 确保有足够空间（至少 5GB）
5. **网络连接：** 构建时需要下载依赖包

---

## 🎉 快速开始

```bash
# 1. 进入项目目录
cd /home/wechat-article-exporter

# 2. 设置执行权限
chmod +x *.sh

# 3. 选择合适的脚本执行
./auto-deploy.sh      # 完整部署
# 或
./quick-deploy.sh     # 快速部署
# 或
./watch-and-deploy.sh # 自动监控
```

祝你部署顺利！🚀
