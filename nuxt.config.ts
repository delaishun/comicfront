// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  devServer: {
    host: '0.0.0.0',
    port: 3001,
  },
  modules: ['@vant/nuxt'],
  // 全局引入 Less 主样式（含变量、重置、布局工具类、CSS 变量）
  css: [
    'vant/lib/index.css',        // 先加载 Vant
    '~/assets/css/common.less',  // 后加载你的覆盖
  ],
  vant: {
    importStyle: false,          // 关掉模块自带的按需样式，改用整包
  },
  runtimeConfig: {
    public: {
      apiBase: 'https://comicb.streetdrip.top',
      ossBaseUrl: 'https://cc-jpbucket.oss-ap-northeast-1.aliyuncs.com',
    },
  },
  app: {
    head: {
      title: '61Comic',
    },
  }
})