import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// サービスワーカーを登録（新バージョン検出時は自動更新）
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <App />
)
