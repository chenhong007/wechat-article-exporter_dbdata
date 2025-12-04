/**
 * Nitro 配置 - 配置后端存储
 * 
 * 支持多种存储后端：
 * - 文件系统 (fs): 适用于 Docker 自托管
 * - Cloudflare KV: 适用于 Cloudflare Pages 部署
 * - Memory: 适用于开发测试
 */

export default defineNitroConfig({
  storage: {
    // 数据存储配置
    data: {
      // 开发环境使用文件系统存储
      driver: process.env.NODE_ENV === 'production' ? 'cloudflare-kv-binding' : 'fs',
      
      // 文件系统存储配置（Docker 自托管）
      base: process.env.STORAGE_BASE_PATH || './.data/storage',
      
      // Cloudflare KV 绑定名称（Cloudflare Pages 部署）
      binding: process.env.KV_BINDING || 'WECHAT_EXPORTER_KV',
    },
  },
  
  // 其他配置...
  devStorage: {
    // 开发环境专用存储
    data: {
      driver: 'fs',
      base: './.data/dev-storage',
    },
  },
});

