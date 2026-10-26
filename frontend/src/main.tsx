import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'
import { store } from './store'
import { initializeAuth } from './features/auth/authSlice'

// Initialize authentication state on app load
store.dispatch(initializeAuth())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
