import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'

const BASE_URL = 'https://innogarage-ai-production.up.railway.app'

export default function ResumeViewer(): React.JSX.Element {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()
  const { profile } = useProfileStore()

  const token = localStorage.getItem('token') || ''

  useEffect(() => {
    if (!isLoggedIn || !profile?.resumeFilename) {
      navigate('/update-account', { replace: true })
    }
  }, [isLoggedIn, profile?.resumeFilename])

  if (!isLoggedIn || !profile?.resumeFilename) {
    return <></>
  }

  const proxyUrl = `${BASE_URL}/profile/resume/proxy?token=${encodeURIComponent(token)}`
  const downloadUrl = `${BASE_URL}/profile/resume/proxy?token=${encodeURIComponent(token)}&download=1`

  const handleDownload = (): void => {
    // Electron's native downloader — saves to system Downloads folder with progress bar
    window.api.downloadFile(downloadUrl)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/80 border-b border-gray-800 shrink-0">
        <button
          onClick={() => navigate('/update-account')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <span className="text-sm text-gray-300 font-medium truncate max-w-xs px-4">
          {profile.resumeFilename}
        </span>

        <button
          onClick={handleDownload}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-brand-500/20 border border-brand-500/40 text-brand-400 hover:bg-brand-500/30 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>

      {/* Resume viewer — fills remaining height */}
      <iframe
        src={proxyUrl}
        className="flex-1 w-full border-0 bg-white"
        title="Resume Preview"
      />
    </div>
  )
}
