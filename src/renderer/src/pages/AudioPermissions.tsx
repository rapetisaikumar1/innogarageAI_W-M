import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Monitor, Mic, Shield, CheckCircle2, AlertCircle, ArrowRight, Info, ScreenShare } from 'lucide-react'
import Button from '../components/ui/Button'
import { useAuthStore } from '../store/authStore'

export default function AudioPermissions(): React.JSX.Element {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()

  const [micGranted, setMicGranted] = useState(false)
  const [systemGranted, setSystemGranted] = useState(false)
  const [screenGranted, setScreenGranted] = useState(false)
  const [micLoading, setMicLoading] = useState(false)
  const [systemLoading, setSystemLoading] = useState(false)
  const [screenLoading, setScreenLoading] = useState(false)
  const [micError, setMicError] = useState('')
  const [systemError, setSystemError] = useState('')
  const [screenError, setScreenError] = useState('')

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/')
    }
  }, [isLoggedIn])

  // User clicks "Allow" for mic — triggers the OS microphone prompt
  const handleRequestMic = async (): Promise<void> => {
    setMicLoading(true)
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setMicGranted(true)
    } catch (err) {
      setMicGranted(false)
      const msg = (err as Error).message
      if (msg.includes('denied') || msg.includes('NotAllowed')) {
        setMicError('Permission denied. Please allow microphone access in System Settings > Privacy > Microphone.')
      } else {
        setMicError('Could not access microphone. Please check your system settings.')
      }
    } finally {
      setMicLoading(false)
    }
  }

  // User clicks "Allow" for system audio — triggers screen capture prompt (macOS)
  const handleRequestSystem = async (): Promise<void> => {
    setSystemLoading(true)
    setSystemError('')
    try {
      const sourceId = await window.api.getDesktopAudioSourceId()
      if (!sourceId) {
        // Auto-open System Settings so user doesn't have to navigate manually
        await window.api.openScreenSettings()
        setSystemError('System Settings has been opened. Enable innogarage.ai under "Screen & System Audio Recording", then fully QUIT this app (Cmd+Q) and reopen it.')
        setSystemGranted(false)
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        } as MediaTrackConstraints,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1,
            maxWidth: 1,
            minHeight: 1,
            maxHeight: 1
          }
        } as MediaTrackConstraints
      })
      stream.getTracks().forEach((t) => t.stop())
      setSystemGranted(true)
    } catch (err) {
      setSystemGranted(false)
      const msg = (err as Error).message
      if (msg.includes('denied') || msg.includes('NotAllowed')) {
        await window.api.openScreenSettings()
        setSystemError('Permission denied. System Settings opened — enable innogarage.ai, then fully QUIT this app (Cmd+Q) and reopen it.')
      } else {
        setSystemError('Could not capture system audio: ' + msg)
      }
    } finally {
      setSystemLoading(false)
    }
  }

  // User clicks "Allow" for screen capture — verifies screen video can be captured
  const handleRequestScreen = async (): Promise<void> => {
    setScreenLoading(true)
    setScreenError('')
    try {
      const sourceId = await window.api.getDesktopAudioSourceId()
      if (!sourceId) {
        await window.api.openScreenSettings()
        setScreenError('System Settings has been opened. Enable innogarage.ai under "Screen & System Audio Recording", then fully QUIT this app (Cmd+Q) and reopen it.')
        setScreenGranted(false)
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 640,
            maxWidth: 1920,
            minHeight: 480,
            maxHeight: 1080
          }
        } as MediaTrackConstraints
      })
      stream.getTracks().forEach((t) => t.stop())
      setScreenGranted(true)
    } catch (err) {
      setScreenGranted(false)
      const msg = (err as Error).message
      if (msg.includes('denied') || msg.includes('NotAllowed')) {
        await window.api.openScreenSettings()
        setScreenError('Permission denied. System Settings opened — enable innogarage.ai, then fully QUIT this app (Cmd+Q) and reopen it.')
      } else {
        setScreenError('Could not capture screen: ' + msg)
      }
    } finally {
      setScreenLoading(false)
    }
  }

  const canStart = micGranted && systemGranted && screenGranted
  const grantedCount = [micGranted, systemGranted, screenGranted].filter(Boolean).length

  return (
    <div className="min-h-full flex flex-col items-center justify-center py-8 px-4 relative overflow-hidden">
      {/* Professional background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gray-950" />
        <div className="absolute -top-32 right-0 w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[130px]" />
        <div className="absolute -bottom-32 -left-20 w-[500px] h-[500px] bg-purple-600/8 rounded-full blur-[110px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '44px 44px'
          }}
        />
      </div>
      <div className="w-full max-w-xl">
        {/* Back button */}
        <button
          onClick={() => navigate('/post-auth')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/30 mb-4">
            <Shield className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Permissions</h1>
          <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
            Grant all permissions below so innogarage.ai can capture audio, screen content, and provide real-time AI assistance.
          </p>
        </div>

        {/* Info notice */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 mb-6">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300/80">
            Click <strong className="text-blue-300">Allow</strong> on each permission below.
            Your browser or macOS will show a system prompt — you must approve it there.
            All permissions are required to start the interview.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(grantedCount / 3) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 font-medium">{grantedCount}/3</span>
        </div>

        {/* Permission Cards */}
        <div className="space-y-4 mb-8">
          {/* Microphone */}
          <div className={`bg-gray-900/50 border rounded-xl p-5 transition-colors ${
            micGranted ? 'border-green-500/30' : 'border-gray-800'
          }`}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <Mic className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">Microphone Input</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Capture your voice — ideal for when you are the speaker
                </p>
              </div>
              {micGranted ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-medium text-green-400">Allowed</span>
                </div>
              ) : (
                <Button size="sm" onClick={handleRequestMic} loading={micLoading}>
                  Allow
                </Button>
              )}
            </div>
            {micError && (
              <p className="text-xs text-red-400 mt-3 ml-16">{micError}</p>
            )}
          </div>

          {/* System Audio */}
          <div className={`bg-gray-900/50 border rounded-xl p-5 transition-colors ${
            systemGranted ? 'border-green-500/30' : 'border-gray-800'
          }`}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                <Monitor className="w-6 h-6 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">System Audio</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Capture interviewer audio from your system output
                </p>
              </div>
              {systemGranted ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-medium text-green-400">Allowed</span>
                </div>
              ) : (
                <Button size="sm" onClick={handleRequestSystem} loading={systemLoading}>
                  Allow
                </Button>
              )}
            </div>
            {systemError && (
              <p className="text-xs text-red-400 mt-3 ml-16">{systemError}</p>
            )}
          </div>

          {/* Screen Capture */}
          <div className={`bg-gray-900/50 border rounded-xl p-5 transition-colors ${
            screenGranted ? 'border-green-500/30' : 'border-gray-800'
          }`}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <ScreenShare className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">Screen Capture</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Capture your screen content for real-time AI code suggestions
                </p>
              </div>
              {screenGranted ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-medium text-green-400">Allowed</span>
                </div>
              ) : (
                <Button size="sm" onClick={handleRequestScreen} loading={screenLoading}>
                  Allow
                </Button>
              )}
            </div>
            {screenError && (
              <p className="text-xs text-red-400 mt-3 ml-16">{screenError}</p>
            )}
          </div>
        </div>

        {/* Requirement notice */}
        {!canStart && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 mb-8">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-yellow-300 font-medium">All Permissions Required</p>
              <p className="text-xs text-yellow-400/70 mt-1">
                Enable all three permissions above to start the interview.
              </p>
            </div>
          </div>
        )}

        {/* Start Interview Button */}
        <div className="text-center">
          <Button
            size="lg"
            className="min-w-[220px]"
            disabled={!canStart}
            onClick={() => navigate('/interview')}
          >
            Start Interview
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
}
