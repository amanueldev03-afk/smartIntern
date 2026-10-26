import { Routes, Route } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import ProtectedRoute from './ProtectedRoute'
import PublicRoute from './PublicRoute'
import RoleRoute from './RoleRoute'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage'
import StudentDashboard from '@/pages/student/StudentDashboard'
import StudentRecommendations from '@/pages/student/StudentRecommendations'
import InternshipDetail from '@/pages/student/InternshipDetail'
import InternshipSearch from '@/pages/student/InternshipSearch'
import SavedInternshipsPage from '@/pages/student/SavedInternshipsPage'
import ProfilePage from '@/pages/student/ProfilePage'
import RecommendationHistoryPage from '@/pages/student/RecommendationHistoryPage'
import ApplicationHistoryPage from '@/pages/student/ApplicationHistoryPage'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminStudentManagement from '@/pages/admin/AdminStudentManagement'
import AdminInternshipReview from '@/pages/admin/AdminInternshipReview'
import AdminDataSourceHealth from '@/pages/admin/AdminDataSourceHealth'
import AdminAIMonitoring from '@/pages/admin/AdminAIMonitoring'
import AdvisorDashboard from '@/pages/advisor/AdvisorDashboard'
import CompanyDashboard from '@/pages/company/CompanyDashboard'
import CompanyMentorDashboard from '@/pages/company/CompanyMentorDashboard'
import DeanDashboard from '@/pages/dean/DeanDashboard'
import UILOfficerDashboard from '@/pages/uil/UILOfficerDashboard'
import UnionDashboard from '@/pages/logistics/UnionDashboard'
import DormDashboard from '@/pages/logistics/DormDashboard'
import MealCardTracker from '@/pages/logistics/MealCardTracker'
import DormRoomManager from '@/pages/logistics/DormRoomManager'
import AppLayout from '@/components/layout/AppLayout'

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomePage />} />

        {/* Auth routes - public but redirect authenticated users */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-email/:uid/:token" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />

        {/* Social Auth OAuth callback routes */}
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

        {/* Authenticated Application Shell with Left-Side Navigation */}
        <Route element={<AppLayout />}>
          {/* Protected student routes */}
          <Route
            path="/dashboard"
            element={
              <RoleRoute allowedRoles={['student']}>
                <StudentDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/student/dashboard"
            element={
              <RoleRoute allowedRoles={['student']}>
                <StudentDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/recommendations"
            element={
              <RoleRoute allowedRoles={['student']}>
                <StudentRecommendations />
              </RoleRoute>
            }
          />
          <Route
            path="/recommendations/history"
            element={
              <RoleRoute allowedRoles={['student']}>
                <RecommendationHistoryPage />
              </RoleRoute>
            }
          />
          <Route
            path="/applications/history"
            element={
              <RoleRoute allowedRoles={['student']}>
                <ApplicationHistoryPage />
              </RoleRoute>
            }
          />
          <Route
            path="/internships/:id"
            element={
              <RoleRoute allowedRoles={['student']}>
                <InternshipDetail />
              </RoleRoute>
            }
          />
          <Route
            path="/internships"
            element={
              <RoleRoute allowedRoles={['student']}>
                <InternshipSearch />
              </RoleRoute>
            }
          />
          <Route
            path="/search"
            element={
              <RoleRoute allowedRoles={['student']}>
                <InternshipSearch />
              </RoleRoute>
            }
          />
          <Route
            path="/saved"
            element={
              <RoleRoute allowedRoles={['student']}>
                <SavedInternshipsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/saved-internships"
            element={
              <RoleRoute allowedRoles={['student']}>
                <SavedInternshipsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Academic Advisor Dashboard */}
          <Route
            path="/advisor/dashboard"
            element={
              <RoleRoute allowedRoles={['advisor', 'admin']}>
                <AdvisorDashboard />
              </RoleRoute>
            }
          />

          {/* Company HR / Employer Dashboard */}
          <Route
            path="/company/dashboard"
            element={
              <RoleRoute allowedRoles={['company_hr', 'employer', 'admin']}>
                <CompanyDashboard />
              </RoleRoute>
            }
          />

          {/* Company Mentor Dashboard */}
          <Route
            path="/mentor/dashboard"
            element={
              <RoleRoute allowedRoles={['company_mentor', 'mentor', 'admin']}>
                <CompanyMentorDashboard />
              </RoleRoute>
            }
          />

          {/* Department Dean Dashboard */}
          <Route
            path="/dean/dashboard"
            element={
              <RoleRoute allowedRoles={['dept_dean', 'dean', 'finance_officer', 'finance', 'admin']}>
                <DeanDashboard />
              </RoleRoute>
            }
          />

          {/* UIL Officer Dashboard */}
          <Route
            path="/uil/dashboard"
            element={
              <RoleRoute allowedRoles={['uil_officer', 'uil', 'admin']}>
                <UILOfficerDashboard />
              </RoleRoute>
            }
          />

          {/* Student Union Hub */}
          <Route
            path="/union/dashboard"
            element={
              <RoleRoute allowedRoles={['student_union', 'union', 'admin']}>
                <UnionDashboard />
              </RoleRoute>
            }
          />

          {/* Dormitory Admin Hub */}
          <Route
            path="/dorm/dashboard"
            element={
              <RoleRoute allowedRoles={['dorm_admin', 'dorm', 'admin']}>
                <DormDashboard />
              </RoleRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/admin/dashboard"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/students"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <AdminStudentManagement />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/internships/review"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <AdminInternshipReview />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/data-sources"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <AdminDataSourceHealth />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/ai-monitoring"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <AdminAIMonitoring />
              </RoleRoute>
            }
          />

          {/* Track 1 Campus Logistics Direct Routes */}
          <Route
            path="/logistics/meal-cards"
            element={
              <RoleRoute allowedRoles={['student_union', 'union', 'admin']}>
                <MealCardTracker />
              </RoleRoute>
            }
          />
          <Route
            path="/logistics/dorm-rooms"
            element={
              <RoleRoute allowedRoles={['dorm_admin', 'dorm', 'admin']}>
                <DormRoomManager />
              </RoleRoute>
            }
          />
        </Route>
      </Routes>
  )
}
