## 背景
项目需要在「不登录公众号后台」的情况下，利用本地抓取到的 `Credentials`（`__biz/uin/key/pass_ticket/wap_sid2` 等）来：

- 关联公众号账号（fakeid = `__biz`）
- 下载文章与资源
- 抓取文章统计数据：阅读/点赞/分享/喜欢/留言等

## 现象（需要修复）
- **抓取 Credentials 速度慢**：UI 每 3 秒轮询一次，但解析/刷新卡顿明显。
- **抓取 Credentials 成功率低**：经常拿不到 `wap_sid2`，导致凭据被丢弃。
- **统计字段缺失**：只能抓到阅读量，**点赞/分享/喜欢** 等字段为 0。

## 可达到 10 倍提速的方案（优先级从高到低）
1) **改为“增量推送”替代轮询**
   - mitmproxy 插件（`./wxdown-service`）直接通过 WebSocket/SSE 推送新增或变更记录，前端只做增量合并，不再每 3 秒全量拉取。
   - 这是最接近 10x 的方案，避免“全量 JSON + 全量解析 + 全量渲染”。
2) **插件端用内存作为数据源**
   - `/credentials` 直接从内存返回，不落盘读取。
   - 仅在应用退出或定时落盘，彻底消除频繁写文件的 IO 抖动。
3) **返回“已解析字段”**
   - 插件端直接解析出 `biz/uin/key/pass_ticket/wap_sid2`（避免前端 URL 解析 + regex）。
   - 前端只做最小字段合并。
4) **避免全量 LocalStorage 写入**
   - 改用 IndexedDB（或仅保存最近 N 条），并对保存做 debounce。
   - 大列表写 localStorage 是纯主线程阻塞。
5) **请求防重入 + diff 过滤**
   - `fetchCredentials` 加 in-flight 标志，上一轮未结束就跳过下一轮。
   - 返回带 `lastUpdateTs`，前端若无变化直接跳过解析与渲染。

## 对比 `wechat-article-exporter_src`：关键差异与性能退化原因
- **统计字段解析策略变化**：
  - `wechat-article-exporter_src` 的下载器使用 `parseCgiDataNew(html)`，从 `window.cgiDataNew.user_info.appmsg_bar_data` 直接读取 `read_num / old_like_count / share_count / like_count / comment_count`。
  - 当前版本改为 `DOMParser + 正则/DOM` 的方式，主要只保证了 `read_num`，其余字段很多场景拿不到（或格式化后无法 `Number()`）。

- **Credentials 解析链路的“隐性慢点”**：
  - 前端在解析每一条凭据时 **逐条 `await getInfoCache(__biz)`**，导致一次刷新时长与结果条数线性增长（轮询叠加后表现为卡顿/慢）。
  - `wap_sid2` 解析依赖 `set_cookie` 字符串里包含 `wap_sid2=...;`，但本地抓取端可能没拿到完整的 `Set-Cookie`，从而导致大量凭据被判定为不完整而丢弃（成功率低）。

## 修复方案（已落地）
### 1) 提升 Credentials 成功率（更稳地拿到 `wap_sid2`）
- 更新 `public/plugins/credential.py`：
  - **同时从请求 `Cookie` 与响应 `Set-Cookie`** 两个来源抓取 cookie 数据（更稳）。
  - 对响应 `Set-Cookie` 使用 `get_all("Set-Cookie")` 合并（避免只取到一条导致缺 `wap_sid2`）。
  - 输出增加 `cookie` 字段，且 `set_cookie` 缺失时自动用 `cookie` 兜底，保证前端可解析。

### 2) 提升 Credentials 刷新速度（避免逐条 await）
- 更新 `components/global/CredentialsDialog.vue`：
  - `getInfoCache` 改为 **并行查询**（`Promise.allSettled`），显著降低每次刷新耗时。
  - `wap_sid2` 提取改为更宽松的 `[,;]` 分隔匹配，并支持从 `set_cookie` 或 `cookie` 任一字段提取。
  - 同一 `__biz` 多条记录只保留最新的一条，减少无效计算。

### 3) 补齐点赞/分享/喜欢等统计字段
- 更新 `utils/download/Downloader.ts`：
  - 恢复/引入浏览器端解析 `cgiDataNew/cgiData` 的逻辑（iframe 隔离执行目标脚本）。
  - 从 `cgiData.user_info.appmsg_bar_data` 读取：`read_num / old_like_count / share_count / like_count / comment_count`，并写入 metadata 缓存。
  - 若解析失败，保留原有正则/DOM 兜底逻辑（至少阅读量不丢）。

## 验收标准
- **Credentials**：在同样的抓取动作下，`wap_sid2` 缺失导致的丢弃明显减少；列表刷新不再卡顿。
- **统计字段**：导出的 SQLite/表格/页面列表中，**点赞/分享/喜欢** 不再普遍为 0（在有数据的文章上能正确显示）。
