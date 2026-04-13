import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Clock, MessageSquare, FileText, ChevronDown, ChevronUp,
  Mic2, Calendar, Trash2, History
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useSessionStore, PastSession } from '../store/sessionStore'
import type { QAPair, TranscriptionEntry } from '../store/interviewStore'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ── Individual session card ───────────────────────────────────────────────────
function SessionCard({ session, index }: { session: PastSession; index: number }): React.JSX.Element {
  const [expanded, setExpanded] = useState(index === 0)
  const [activeTab, setActiveTab] = useState<'qa' | 'transcripts'>('qa')

  const qaPairs: QAPair[] = [...session.qaPairs].reverse()
  const transcriptions: TranscriptionEntry[] = [...session.transcriptions].reverse()

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Card header */}
      <button
        className="w-full flex items-center justify-between p-5 hover:bg-gray-800/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-4">
          {/* Session number badge */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
            <span className="text-brand-400 text-xs font-bold">#{index + 1}</span>
          </div>

          <div className="text-left">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-sm text-white font-medium">{formatDate(session.date)}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(session.duration)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {session.qaPairs.length} Q&amp;A pairs
              </span>
              <span className="flex items-center gap-1">
                <Mic2 className="w-3 h-3" />
                {session.transcriptions.length} transcriptions
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0 ml-4">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-800">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('qa')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === 'qa'
                  ? 'text-brand-400 border-b-2 border-brand-500 -mb-px'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Q&amp;A Pairs
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-800 text-xs text-gray-400">
                {session.qaPairs.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('transcripts')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === 'transcripts'
                  ? 'text-brand-400 border-b-2 border-brand-500 -mb-px'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              Transcriptions
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-800 text-xs text-gray-400">
                {session.transcriptions.length}
              </span>
            </button>
          </div>

          {/* Tab content */}
          <div className="p-5">
            {activeTab === 'qa' ? (
              qaPairs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No Q&amp;A recorded in this session.</p>
              ) : (
                <div className="space-y-4">
                  {qaPairs.map((pair, i) => (
                    <div key={pair.id} className="rounded-xl overflow-hidden border border-gray-800/80">
                      {/* Question */}
                      <div className="flex items-start gap-3 p-4 bg-gray-800/30">
                        <div className="w-6 h-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-brand-400">Q</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 mb-1">Question {i + 1}</p>
                          <p className="text-sm text-gray-200 leading-relaxed">{pair.question}</p>
                        </div>
                      </div>
                      {/* Answer */}
                      <div className="flex items-start gap-3 p-4 bg-gray-900/30">
                        <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-green-400">A</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 mb-1">Answer</p>
                          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{pair.answer}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              transcriptions.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No transcriptions recorded in this session.</p>
              ) : (
                <div className="space-y-2">
                  {transcriptions.map((t, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/30 border border-gray-800/50">
                      <Mic2 className="w-3.5 h-3.5 text-gray-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-300 leading-relaxed">{t.text}</p>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/10 to-purple-500/10 border border-brand-500/20 flex items-center justify-center mb-6">
        <History className="w-10 h-10 text-brand-500/40" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">No sessions yet</h2>
      <p className="text-sm text-gray-500 max-w-xs">
        Complete an interview and your session history will appear here with all Q&amp;A pairs and transcriptions.
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PastSessions(): React.JSX.Element {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()
  const { sessions, loadSessions, clearAll } = useSessionStore()
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/')
      return
    }
    loadSessions()
  }, [isLoggedIn])

  const handleClearAll = (): void => {
    clearAll()
    setShowConfirm(false)
  }

  return (
    <div className="min-h-full py-6 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {sessions.length > 0 && (
            <div>
              {showConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Delete all sessions?</span>
                  <button
                    onClick={handleClearAll}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Page title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/30 flex items-center justify-center">
              <History className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Past Sessions</h1>
              <p className="text-sm text-gray-500">
                {sessions.length === 0
                  ? 'No sessions recorded yet'
                  : `${sessions.length} session${sessions.length === 1 ? '' : 's'} recorded`}
              </p>
            </div>
          </div>
        </div>

        {/* Sessions list */}
        {sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {sessions.map((session, index) => (
              <SessionCard key={session.id} session={session} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
