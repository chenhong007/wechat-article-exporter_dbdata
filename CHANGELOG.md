# Changelog

本文件记录项目的重要变更。

## [未发布] - 2024-12-04

### ✨ 新增功能

- **数据库支持**: 新增 SQLite 数据库支持，用于持久化存储账号信息
  - 新增 `drizzle.config.ts` 配置文件
  - 新增 `server/database/schema.ts` 数据库表结构定义
  - 新增 `server/utils/db.ts` 数据库操作工具
  - 新增 `server/api/accounts/index.get.ts` 账号数据 API 接口

- **组件扩展**: 新增可复用的 UI 组件
  - 新增 `components/grid/AccountLink.vue` 账号链接组件
  - 新增 `components/grid/LinkWithIcon.vue` 带图标的链接组件

### 🔧 改进优化

- **Fakeid 验证增强**: 全面加强公众号 ID (fakeid) 的有效性验证
  - 在 `apis/index.ts` 中添加 `isValidFakeid()` 验证函数
  - 在 `pages/dashboard/account.vue` 中添加账号数据完整性检查
  - 在 `server/api/web/mp/appmsgpublish.get.ts` 中添加服务端 fakeid 验证
  - 使用正则表达式验证 fakeid 格式（base64 编码，10-50 字符）

- **错误处理优化**
  - 添加友好的错误提示信息，明确指出无效数据来源
  - 针对 200002 错误码提供特殊处理和用户提示
  - 在批量同步时增加错误捕获，显示详细的成功/失败统计

- **API 参数优化**
  - `getArticleList()`: 只在有搜索关键词时才添加 `keyword` 参数
  - `appmsgpublish.get.ts`: 将 `keyword` 参数改为可选
  - 优化查询参数构建逻辑，避免传递空值

- **用户体验改进**
  - 在账号同步时显示详细进度和结果统计
  - 添加数据验证功能（开发模式）
  - 改进错误提示的可读性和实用性
  - 在选择公众号前进行数据完整性检查

### 🐛 问题修复

- 修复 fakeid 为空或无效时导致的 API 调用失败问题
- 修复批量同步时部分账号失败但没有提示的问题
- 修复搜索功能参数传递错误的问题

### 📦 依赖更新

- 新增 `drizzle-orm` 和 `drizzle-kit` 数据库 ORM 工具
- 新增 `better-sqlite3` SQLite 数据库驱动
- 更新 `yarn.lock`（新增 1000+ 行依赖）

### 📝 代码质量

- 添加详细的函数注释和参数说明
- 统一 fakeid 验证逻辑，避免代码重复
- 改进类型定义，增强类型安全性

---

## [1204版本] - 2024-12-04

### 重构优化

- 封装 `useLoginCheck` 和 `useAccountEventBus` 组合式函数
- 重新归类 utils，客户端和服务器通用工具类迁移到 shared 目录
- 封装 `$fetch` 调用
- 组织 imports 导入顺序
- 添加 format 命令用于格式化代码
- 增加同步截止时间配置

---

## 变更说明

### 语义化版本

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)规范：

- **主版本号（MAJOR）**: 不兼容的 API 修改
- **次版本号（MINOR）**: 向下兼容的功能性新增
- **修订号（PATCH）**: 向下兼容的问题修正

### 变更类型

- ✨ **新增功能**: 新功能添加
- 🔧 **改进优化**: 现有功能的改进
- 🐛 **问题修复**: Bug 修复
- 📦 **依赖更新**: 依赖包的更新
- 📝 **文档更新**: 文档变更
- 🎨 **样式调整**: UI/样式改进
- ♻️ **代码重构**: 代码重构，不影响功能
- 🚀 **性能优化**: 性能改进
- 🔒 **安全修复**: 安全问题修复
- 🗑️ **废弃**: 标记为废弃的功能

