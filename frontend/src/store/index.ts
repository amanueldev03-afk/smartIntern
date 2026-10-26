import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/features/auth/authSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    // Feature slices are added here as they are built:
    // internships: internshipsReducer,
    // recommendations: recommendationsReducer,
    // applications: applicationsReducer,
    // notifications: notificationsReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
