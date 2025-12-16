# 网络连接问题排查指南

## 问题描述

如果您看到类似以下的错误信息：

```
ERROR fetch failed
[cause]: Client network socket disconnected before secure TLS connection was established
```

这表示应用在尝试连接微信服务器时遇到了网络问题。

## 常见原因

1. **网络不稳定** - 本地网络连接不稳定或间歇性断开
2. **防火墙阻止** - 系统防火墙或安全软件阻止了连接
3. **需要代理** - 某些网络环境需要通过代理才能访问外部服务器
4. **DNS 解析问题** - DNS 服务器无法正确解析域名

## 解决方案

### 1. 检查网络连接

确保您的网络连接稳定，可以正常访问互联网。

### 2. 配置系统代理（如果需要）

如果您的网络环境需要通过代理访问，可以设置以下环境变量：

**Windows (PowerShell):**
```powershell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
```

**Windows (CMD):**
```cmd
set HTTP_PROXY=http://127.0.0.1:7890
set HTTPS_PROXY=http://127.0.0.1:7890
```

**Linux/macOS:**
```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
```

**Docker 环境:**

在 `docker-compose.yml` 中添加环境变量：

```yaml
version: '3'
services:
  app:
    # ... 其他配置
    environment:
      - HTTP_PROXY=http://host.docker.internal:7890
      - HTTPS_PROXY=http://host.docker.internal:7890
      - NO_PROXY=localhost,127.0.0.1
```

### 3. 调整重试参数

应用已经内置了自动重试机制（默认重试 3 次），您可以通过环境变量调整：

```bash
# 最大重试次数
REQUEST_MAX_RETRIES=5

# 请求超时时间（毫秒）
REQUEST_TIMEOUT=60000

# 重试延迟基数（毫秒）
REQUEST_RETRY_DELAY=2000
```

### 4. 检查防火墙设置

确保防火墙允许应用访问以下域名：
- `mp.weixin.qq.com`
- `*.qq.com`

**Windows 防火墙:**
1. 打开 Windows 安全中心
2. 转到"防火墙和网络保护"
3. 点击"允许应用通过防火墙"
4. 确保 Node.js 被允许通过防火墙

### 5. 尝试更换 DNS

某些情况下，DNS 解析问题会导致连接失败。可以尝试更换为公共 DNS：

- Google DNS: `8.8.8.8`, `8.8.4.4`
- Cloudflare DNS: `1.1.1.1`, `1.0.0.1`
- 阿里 DNS: `223.5.5.5`, `223.6.6.6`

### 6. 开启调试日志

如果问题持续，可以开启详细日志以便排查：

```bash
NUXT_DEBUG_MP_REQUEST=true
```

这将记录所有请求和响应的详细信息。

## 性能优化建议

如果连接经常失败，建议：

1. **增加重试次数**: `REQUEST_MAX_RETRIES=5`
2. **延长超时时间**: `REQUEST_TIMEOUT=60000` (60秒)
3. **增加重试延迟**: `REQUEST_RETRY_DELAY=2000` (2秒)

## Docker 特别说明

在 Docker 环境中，如果宿主机使用代理，需要特别注意：

1. **使用 host.docker.internal** 访问宿主机代理：
   ```yaml
   environment:
     - HTTP_PROXY=http://host.docker.internal:7890
   ```

2. **配置 DNS**（如果需要）：
   ```yaml
   dns:
     - 8.8.8.8
     - 1.1.1.1
   ```

3. **网络模式**（如果代理仍然不工作）：
   ```yaml
   network_mode: "host"
   ```
   注意：使用 host 模式会让容器直接使用宿主机网络。

## 仍然无法解决？

如果尝试了以上所有方法仍然无法解决，请：

1. 收集以下信息：
   - 操作系统版本
   - 网络环境描述（是否使用代理、VPN 等）
   - 完整的错误日志
   - 已尝试的解决方案

2. 在项目 GitHub Issues 中提交问题，我们会尽快协助解决。

## 临时解决方案

如果急需使用，可以尝试：

1. **换个网络环境** - 使用手机热点或其他网络
2. **重启网络设备** - 重启路由器和电脑
3. **暂时关闭安全软件** - 测试是否是安全软件导致的问题（测试完记得开启）
