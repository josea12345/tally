import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { supabaseConfigError } from './lib/supabase'
import './index.css'

/** Full-screen explanation when the backend env vars are missing/bad —
 *  the app cannot do anything useful in that state, and a white
 *  screen (the old behavior: createClient threw at module init)
 *  tells the user nothing. */
function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0b12',
        color: '#f4f2ea',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 2 }}>TALLY</div>
        <p style={{ marginTop: 14, fontWeight: 700 }}>This build isn’t connected to its backend.</p>
        <p style={{ marginTop: 8, opacity: 0.75, fontSize: 14, lineHeight: 1.55 }}>
          {message} Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (in{' '}
          <code>.env</code> locally, or the Vercel project’s Environment Variables) and redeploy.
        </p>
      </div>
    </div>
  )
}

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
  supabaseConfigError ? (
    <ConfigErrorScreen message={supabaseConfigError} />
  ) : (
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  ),
)
