import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router.js'
import './style.css'
// 弹窗按钮等 Element Plus 自带文案跟随组件语言，不设 locale 会露出 Cancel/OK
createApp(App).use(router).use(ElementPlus, { locale: zhCn }).mount('#app')
