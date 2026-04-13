import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import CreateAccount from './pages/CreateAccount'
import SignIn from './pages/SignIn'
import ForgotPassword from './pages/ForgotPassword'
import PostAuth from './pages/PostAuth'
import UpdateAccount from './pages/UpdateAccount'
import UpgradePlan from './pages/UpgradePlan'
import ResumeViewer from './pages/ResumeViewer'
import AudioPermissions from './pages/AudioPermissions'
import InterviewScreen from './pages/InterviewScreen'
import PastSessions from './pages/PastSessions'
import { useAuthStore } from './store/authStore'

function App(): React.JSX.Element {
  const { loadFromStorage } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/post-auth" element={<PostAuth />} />
          <Route path="/update-account" element={<UpdateAccount />} />
          <Route path="/upgrade-plan" element={<UpgradePlan />} />
          <Route path="/resume-viewer" element={<ResumeViewer />} />
          <Route path="/audio-permissions" element={<AudioPermissions />} />
          <Route path="/interview" element={<InterviewScreen />} />
          <Route path="/past-sessions" element={<PastSessions />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
