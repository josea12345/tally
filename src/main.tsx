import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './index.css'

// iOS home-screen web apps: navigator.standalone is Apple's own signal that
// we're running as an installed PWA (CSS display-mode is unreliable on iOS).
// The .ios-pwa class drives the status-bar clearance in index.css.
if ((window.navigator as any).standalone === true) {
  document.documentElement.classList.add('ios-pwa')
}

// Register a minimal service worker so the PWA install prompt can fire.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is best-effort */
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
