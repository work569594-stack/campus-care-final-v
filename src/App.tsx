import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CampusChatbot } from '@/src/components/CampusChatbot';
import { CustomCursor } from '@/src/components/CustomCursor';
import { Footer } from '@/src/components/Footer';
import { Navbar } from '@/src/components/Navbar';
import { ProtectedRoute } from '@/src/components/ProtectedRoute';
import { SupabaseBanner } from '@/src/components/SupabaseBanner';
import { AuthProvider } from '@/src/context/AuthContext';
import { SoundProvider } from '@/src/context/SoundContext';
import { ToastProvider } from '@/src/context/ToastContext';
import { AdminDashboardPage } from '@/src/pages/AdminDashboardPage';
import { AdminLoginPage } from '@/src/pages/AdminLoginPage';
import { Campus3DPage } from '@/src/pages/Campus3DPage';
import { LandingPage } from '@/src/pages/LandingPage';
import { ReportPage } from '@/src/pages/ReportPage';
import { StudentLoginPage } from '@/src/pages/StudentLoginPage';
import { TrackPage } from '@/src/pages/TrackPage';

function AnimatedRoutes() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin') && location.pathname !== '/admin/login';
  const is3DRoute = location.pathname === '/campus-3d';

  return (
    <div className="min-h-screen flex flex-col bg-[#05070D] bg-campus-aurora bg-campus-grid">
      <Navbar />
      <SupabaseBanner />

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <Routes location={location}>
              <Route path="/" element={<LandingPage />} />
              <Route
                path="/report"
                element={
                  <ProtectedRoute>
                    <ReportPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/track" element={<TrackPage />} />
              <Route path="/campus-3d" element={<Campus3DPage />} />
              <Route path="/login" element={<StudentLoginPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      {!isAdminRoute && !is3DRoute && <Footer />}
      {!is3DRoute && <CampusChatbot />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SoundProvider>
        <ToastProvider>
          <AuthProvider>
            <CustomCursor />
            <AnimatedRoutes />
          </AuthProvider>
        </ToastProvider>
      </SoundProvider>
    </BrowserRouter>
  );
}
