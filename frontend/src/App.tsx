import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { store } from '@/store'
import AppRoutes from '@/routes'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AccessibilityProvider } from '@/contexts/AccessibilityContext'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export default function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <AccessibilityProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </BrowserRouter>
        </AccessibilityProvider>
      </ThemeProvider>
    </Provider>
  )
}
