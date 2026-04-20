import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { useInterviewStore } from '../../store/interviewStore'
import { useSessionStore } from '../../store/sessionStore'
import { User, LogOut, Crown, Mic, Monitor, LogOut as ExitIcon, Timer, Eye, EyeOff, History } from 'lucide-react'
import { stopAudioPipeline } from '../../services/audioPipeline'
import { api } from '../../services/api'

const isMac = window.api.platform === 'darwin'

// ── macOS traffic-light buttons ──────────────────────────────────────────────
function MacControls({
  onClose,
  onMinimize,
  onMaximize
}: {
  onClose: () => void
  onMinimize: () => void
  onMaximize: () => void
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="no-drag flex items-center gap-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Close — red */}
      <button
        onClick={onClose}
        title="Close"
        className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e]/60 flex items-center justify-center hover:brightness-90 transition-all focus:outline-none"
      >
        {hovered && (
          <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
            <path d="M1 1l4 4M5 1L1 5" stroke="#4d0000" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {/* Minimize — yellow */}
      <button
        onClick={onMinimize}
        title="Minimize"
        className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#d09a0a]/60 flex items-center justify-center hover:brightness-90 transition-all focus:outline-none"
      >
        {hovered && (
          <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
            <path d="M1 3h4" stroke="#4d3800" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {/* Maximize — green */}
      <button
        onClick={onMaximize}
        title="Zoom"
        className="w-3 h-3 rounded-full bg-[#28c941] border border-[#1aab29]/60 flex items-center justify-center hover:brightness-90 transition-all focus:outline-none"
      >
        {hovered && (
          <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
            <path d="M1 5L5 1M1 3V1h2M3 5h2V3" stroke="#003d00" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ── Windows-style controls ────────────────────────────────────────────────────
function WinControls({
  onMinimize,
  onMaximize,
  onClose,
  isMaximized
}: {
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  isMaximized: boolean
}): React.JSX.Element {
  return (
    <div className="no-drag flex items-center">
      {/* Minimize */}
      <button
        onClick={onMinimize}
        title="Minimize"
        className="w-11 h-10 flex items-center justify-center hover:bg-white/10 transition-colors focus:outline-none"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
          <path d="M0 0.5h10" stroke="#9ca3af" strokeWidth="1" />
        </svg>
      </button>
      {/* Maximize / Restore */}
      <button
        onClick={onMaximize}
        title={isMaximized ? 'Restore' : 'Maximize'}
        className="w-11 h-10 flex items-center justify-center hover:bg-white/10 transition-colors focus:outline-none"
      >
        {isMaximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="2.5" y="0.5" width="7" height="7" stroke="#9ca3af" strokeWidth="1" fill="none" />
            <path d="M0.5 2.5v7h7" stroke="#9ca3af" strokeWidth="1" fill="none" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="#9ca3af" strokeWidth="1" fill="none" />
          </svg>
        )}
      </button>
      {/* Close */}
      <button
        onClick={onClose}
        title="Close"
        className="w-11 h-10 flex items-center justify-center hover:bg-red-500 transition-colors group focus:outline-none"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round" className="group-hover:stroke-white" />
        </svg>
      </button>
    </div>
  )
}

// ── Main Titlebar ─────────────────────────────────────────────────────────────
export default function Titlebar(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn, logout } = useAuthStore()
  const { plan, reset: resetProfile } = useProfileStore()
  const { audioSource, setAudioSource, elapsedSeconds, setElapsedSeconds, reset: resetInterview } = useInterviewStore()
  const { saveSession } = useSessionStore()
  const [isMaximized, setIsMaximized] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)

  const isInterviewScreen = location.pathname === '/interview'
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync isMaximized with actual window state (handles OS-initiated maximize/restore)
  useEffect(() => {
    const syncMaximized = async (): Promise<void> => {
      setIsMaximized(await window.api.isMaximized())
    }
    // Check on mount and whenever route changes (covers maximize via OS shortcuts)
    syncMaximized()
  }, [location.pathname])

  // Auto-enable private mode when on interview screen, restore public on exit
  useEffect(() => {
    if (isInterviewScreen) {
      setIsPrivate(true)
      window.api.setContentProtection(true)
      window.api.setSkipTaskbar(true)
    } else {
      setIsPrivate(false)
      window.api.setContentProtection(false)
      window.api.setSkipTaskbar(false)
    }
  }, [isInterviewScreen])

  // Interview timer
  useEffect(() => {
    if (isInterviewScreen) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(useInterviewStore.getState().elapsedSeconds + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isInterviewScreen, setElapsedSeconds])

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleMinimize = (): void => window.api.minimize()

  const handleMaximize = async (): Promise<void> => {
    window.api.maximize()
    const max = await window.api.isMaximized()
    setIsMaximized(max)
  }

  const handleClose = (): void => window.api.close()

  const handleLogout = (): void => {
    logout()
    resetProfile()
    navigate('/')
  }

  const handlePrivacyToggle = (): void => {
    const next = !isPrivate
    setIsPrivate(next)
    window.api.setContentProtection(next)
    window.api.setSkipTaskbar(next)
  }

  const handleExitInterview = (): void => {
    // Save session before resetting state
    const state = useInterviewStore.getState()
    if (state.qaPairs.length > 0 || state.transcriptions.length > 0) {
      saveSession({
        id: crypto.randomUUID(),
        date: Date.now(),
        duration: state.elapsedSeconds,
        qaPairs: [...state.qaPairs],
        transcriptions: [...state.transcriptions]
      })
    }
    stopAudioPipeline()
    api.interviewEnd().catch(() => {})
    resetInterview()
    navigate('/post-auth')
  }

  return (
    <header className="drag-region flex items-center h-10 bg-gray-900/95 border-b border-gray-800 shrink-0 backdrop-blur-sm">

      {/* ── macOS: traffic lights LEFT → logo ── */}
      {isMac && (
        <div className="flex items-center gap-3 pl-3 pr-4">
          <MacControls onClose={handleClose} onMinimize={handleMinimize} onMaximize={handleMaximize} />
          {/* Logo */}
          <div
            className="no-drag flex items-center gap-2 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <span className="text-sm font-semibold text-white">
              innogarage<span className="text-brand-400">.ai</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Windows: logo LEFT ── */}
      {!isMac && (
        <div
          className="no-drag flex items-center gap-2 cursor-pointer pl-4"
          onClick={() => navigate('/')}
        >
          <span className="text-sm font-semibold text-white">
            innogarage<span className="text-brand-400">.ai</span>
          </span>
        </div>
      )}

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Shared: interview controls OR plan badge + profile + logout ── */}
      <div className="no-drag flex items-center gap-1 pr-2">
        {isInterviewScreen ? (
          <>
            {/* Audio source toggles */}
            <button
              onClick={() => setAudioSource('mic')}
              className={`p-1.5 rounded-md transition-colors ${
                audioSource === 'mic'
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'hover:bg-gray-700/50 text-gray-500'
              }`}
              title="Microphone Input"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={() => setAudioSource('system')}
              className={`p-1.5 rounded-md transition-colors ${
                audioSource === 'system'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'hover:bg-gray-700/50 text-gray-500'
              }`}
              title="System Audio"
            >
              <Monitor className="w-4 h-4" />
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-gray-700 mx-1" />

            {/* Timer */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">
              <Timer className="w-3 h-3 text-gray-400" />
              <span className="text-xs font-mono text-gray-300 tabular-nums">
                {formatTime(elapsedSeconds)}
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-gray-700 mx-1" />

            {/* Private/Public toggle — visible on interview screen too */}
            <button
              onClick={handlePrivacyToggle}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                isPrivate
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400 hover:bg-purple-500/30'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
              }`}
              title={isPrivate ? 'Private — app hidden from screen sharing' : 'Public — app visible in screen sharing'}
            >
              {isPrivate ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isPrivate ? 'Private' : 'Public'}</span>
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-gray-700 mx-1" />

            {/* Exit button */}
            <button
              onClick={handleExitInterview}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors"
              title="Exit Interview"
            >
              <ExitIcon className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-medium text-red-400">Exit</span>
            </button>
          </>
        ) : (
          <>
            {isLoggedIn && plan && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 mr-1">
                <Crown className="w-3 h-3 text-amber-400" />
                <span className="text-xs text-amber-400 font-medium capitalize">{plan.planType}</span>
              </div>
            )}
            {isLoggedIn && (
              <>
                {/* Private/Public toggle */}
                <button
                  onClick={handlePrivacyToggle}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    isPrivate
                      ? 'bg-purple-500/20 border-purple-500/30 text-purple-400 hover:bg-purple-500/30'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                  }`}
                  title={isPrivate ? 'Private — app hidden from screen sharing' : 'Public — app visible in screen sharing'}
                >
                  {isPrivate ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{isPrivate ? 'Private' : 'Public'}</span>
                </button>

                {/* Past Sessions */}
                <button
                  onClick={() => navigate('/past-sessions')}
                  className="p-1.5 rounded-md hover:bg-gray-700/50 transition-colors"
                  title="Past Sessions"
                >
                  <History className="w-4 h-4 text-gray-400 hover:text-white" />
                </button>

                {/* Profile */}
                <button
                  onClick={() => navigate('/update-account')}
                  className="p-1.5 rounded-md hover:bg-gray-700/50 transition-colors"
                  title="Profile"
                >
                  <User className="w-4 h-4 text-gray-400 hover:text-white" />
                </button>

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-md hover:bg-gray-700/50 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4 text-gray-400 hover:text-white" />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Windows: controls RIGHT ── */}
      {!isMac && (
        <WinControls
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
          isMaximized={isMaximized}
        />
      )}
    </header>
  )
}
