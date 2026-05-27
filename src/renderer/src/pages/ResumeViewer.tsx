import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { api } from '../services/api'

export default function ResumeViewer(): React.JSX.Element {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()
  const { profile } = useProfileStore()
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canPreview = profile?.resumeFilename?.toLowerCase().endsWith('.pdf') ?? false

  useEffect(() => {
    if (!isLoggedIn || !profile?.resumeFilename) {
      navigate('/update-account', { replace: true })
    }
  }, [isLoggedIn, profile?.resumeFilename])

  useEffect(() => {
    if (!isLoggedIn || !profile?.resumeFilename) return

    let nextUrl: string | null = null
    let cancelled = false

    const loadResume = async (): Promise<void> => {
      setLoading(true)
      setError(null)

      try {
        const blob = await api.getResumeFile()
        if (cancelled) return
        nextUrl = URL.createObjectURL(blob)
        setResumeUrl(nextUrl)
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message)
          setResumeUrl(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadResume()

    return () => {
      cancelled = true
      if (nextUrl) URL.revokeObjectURL(nextUrl)
    }
  }, [isLoggedIn, profile?.resumeFilename])

  if (!isLoggedIn || !profile?.resumeFilename) {
    return <></>
  }

  const handleDownload = (): void => {
    if (!resumeUrl) return

    const link = document.createElement('a')
    link.href = resumeUrl
    link.download = profile.resumeFilename || 'resume'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
          disabled={!resumeUrl || loading}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-brand-500/20 border border-brand-500/40 text-brand-400 hover:bg-brand-500/30 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>

      {/* Resume viewer — fills remaining height */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center bg-gray-950">
          <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center bg-gray-950 px-6 text-center">
          <div>
            <p className="text-sm text-red-400">{error}</p>
            <p className="text-xs text-gray-500 mt-2">Try reopening the resume or downloading the file.</p>
          </div>
        </div>
      ) : canPreview && resumeUrl ? (
        <iframe
          src={resumeUrl}
          className="flex-1 w-full border-0 bg-white"
          title="Resume Preview"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-950 px-6 text-center">
          <div>
            <p className="text-sm text-gray-300">Preview is available only for PDF resumes.</p>
            <p className="text-xs text-gray-500 mt-2">Use Download to open Word documents locally.</p>
          </div>
        </div>
      )}
    </div>
  )
}
