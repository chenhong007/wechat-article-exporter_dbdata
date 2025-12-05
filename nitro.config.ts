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
      // 使用环境变量控制存储驱动，默认使用文件系统
      // STORAGE_DRIVER=cloudflare-kv-binding 用于 Cloudflare Pages 部署
      // STORAGE_DRIVER=fs 或不设置，用于 Docker 自托管
      driver: process.env.STORAGE_DRIVER || 'fs',
      
      // 文件系统存储配置（Docker 自托管）
      base: process.env.STORAGE_BASE_PATH || './.data/storage',
      
      // Cloudflare KV 绑定名称（Cloudflare Pages 部署）
      binding: process.env.KV_BINDING || 'WECHAT_EXPORTER_KV',
    },
    
    // KV 存储配置 - 用于存储用户 Cookie 和会话信息
    kv: {
      // 使用环境变量控制存储驱动
      // NITRO_KV_DRIVER=cloudflare-kv-binding 用于 Cloudflare Pages 部署
      // NITRO_KV_DRIVER=fs 或不设置，用于 Docker 自托管
      driver: process.env.NITRO_KV_DRIVER || 'fs',
      
      // 文件系统存储配置（Docker 自托管）
      base: process.env.NITRO_KV_BASE || './.data/kv',
      
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
    // 开发环境 KV 存储
    kv: {
      driver: 'fs',
      base: './.data/dev-kv',
    },
  },
});

