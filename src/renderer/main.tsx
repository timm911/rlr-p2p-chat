import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './utils/theme'
import { initDensity } from './utils/density'
import { initAccent } from './utils/accent'
import { initBackground } from './utils/background'
import { initTextSize } from './utils/text-size'
import { preloadSelected } from './services/notification-sound'
import './styles/global.css'

initTheme()
initDensity()
initAccent()
initBackground()
initTextSize()
preloadSelected()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
