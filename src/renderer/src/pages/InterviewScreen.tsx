import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, MessageSquare, Sparkles, AudioLines, Code2, Monitor, Copy, Check, Send } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useInterviewStore } from '../store/interviewStore'
import { useSessionStore } from '../store/sessionStore'
import { startAudioPipeline, stopAudioPipeline, switchAudioSource } from '../services/audioPipeline'
import { startScreenCapture, stopScreenCapture, pauseScreenCapture, resumeScreenCapture } from '../services/screenCapture'
import { api } from '../services/api'
import { useState } from 'react'
import { Power } from 'lucide-react'

export default function InterviewScreen(): React.JSX.Element {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()
  const {
    isInterviewActive,
    audioSource,
    transcriptions,
    currentInterim,
    qaPairs,
    isProcessing,
    error,
    codeSuggestion,
    isAnalyzingScreen,
    screenCaptureActive,
    setInterviewActive,
    addTranscription,
    setCurrentInterim,
    addQAPair,
    updateQAPairAnswer,
    setProcessing,
    setError,
    setCodeSuggestion,
    setAnalyzingScreen,
    setScreenCaptureActive
  } = useInterviewStore()

  const qaBottomRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionStartedRef = useRef(false)
  const isProcessingRef = useRef(false)
  const sendQueueRef = useRef<string[]>([])
  const codePreRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const [screenAnalysisEnabled, setScreenAnalysisEnabled] = useState(false)
  const screenCaptureInitializedRef = useRef(false)
  const mountedRef = useRef(true)
  const [chatInput, setChatInput] = useState('')

  // Auto-scroll to latest QA pair
  useEffect(() => {
    qaBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [qaPairs])

  // Keep isProcessingRef in sync so pipeline callbacks always read the current value
  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  // Directly update code content in the DOM — only on new detected code, never wipes existing
  useEffect(() => {
    if (codePreRef.current && codeSuggestion?.detected && codeSuggestion.suggestion) {
      codePreRef.current.textContent = codeSuggestion.suggestion
    }
  }, [codeSuggestion?.detected, codeSuggestion?.suggestion])

  // Send finalized transcript to AI — streams answer tokens progressively into the UI
  const sendToAI = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      if (isProcessingRef.current) {
        sendQueueRef.current.push(text)
        return
      }
      isProcessingRef.current = true
      setProcessing(true)
      setError(null)

      const id = crypto.randomUUID()
      addQAPair({ id, question: text.trim(), answer: '', timestamp: Date.now() })

      try {
        const doAsk = async (): Promise<void> => {
          let accumulated = ''
          await api.interviewAskStream(text.trim(), (chunk) => {
            accumulated += chunk
            updateQAPairAnswer(id, accumulated)
          })
        }

        try {
          await doAsk()
        } catch (err) {
          const msg = (err as Error).message || ''
          if (msg.includes('No active interview session')) {
            // Rebuild session with full conversation history so context is preserved
            const { qaPairs } = useInterviewStore.getState()
            const history = qaPairs
              .filter(p => p.answer)
              .sort((a, b) => a.timestamp - b.timestamp)
              .map(p => ({ question: p.question, answer: p.answer }))
            await api.interviewStart(history)
            await doAsk()
          } else {
            throw err
          }
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setProcessing(false)
        isProcessingRef.current = false
        const next = sendQueueRef.current.shift()
        if (next) setTimeout(() => sendToAI(next), 0)
      }
    },
    [addQAPair, updateQAPairAnswer, setProcessing, setError]
  )

  // Handle final transcript — server sends complete utterance on UtteranceEnd, send straight to AI
  const handleFinalTranscript = useCallback(
    (text: string) => {
      console.log('[Pipeline STAGE 7] handleFinalTranscript (full utterance):', JSON.stringify(text))
      addTranscription(text)
      sendToAI(text)
    },
    [addTranscription, sendToAI]
  )

  // Start interview session
  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/')
      return
    }

    let mounted = true
    mountedRef.current = true

    const initSession = async (): Promise<void> => {
      try {
        // Initialize AI session on backend
        await api.interviewStart()
        if (!mounted) return  // StrictMode: first mount cleaned up, skip pipeline start

        // Start audio pipeline
        await startAudioPipeline(audioSource, {
          onTranscript: (text, isFinal) => {
            console.log(`[Pipeline onTranscript] isFinal=${isFinal} text=${JSON.stringify(text)} mounted=${mounted}`)
            if (!mounted) return
            if (isFinal) {
              setCurrentInterim('')
              handleFinalTranscript(text)
            } else {
              setCurrentInterim(text)
            }
          },
          onError: (err) => {
            if (mounted) setError(err)
          },
          onStateChange: (state) => {
            if (mounted) {
              setInterviewActive(state === 'listening')
            }
          }
        })

        // Initialize screen capture pipeline (paused — user activates via toggle)
        try {
          const token = localStorage.getItem('token') || ''
          await startScreenCapture({
            token,
            onSuggestion: (result) => {
              if (!mountedRef.current) return
              setCodeSuggestion({
                id: 'screen-suggestion',
                detected: result.detected,
                language: result.language,
                context: result.context,
                suggestion: result.suggestion,
                explanation: result.explanation,
                timestamp: Date.now()
              })
            },
            onAnalyzingChange: (analyzing) => {
              if (mountedRef.current) setAnalyzingScreen(analyzing)
            }
          })
          if (mounted) {
            screenCaptureInitializedRef.current = true
            // Immediately pause — user needs to enable via toggle
            pauseScreenCapture()
            setScreenCaptureActive(false)
          }
        } catch (err) {
          console.error('[ScreenCapture] Failed to start:', (err as Error).message)
        }

        // Bring interview window to front of all applications
        // Platform modules handle ordering internally (e.g. Windows applies
        // content protection before setAlwaysOnTop to avoid WDA resets)
        window.api.setContentProtection(true)
        window.api.setSkipTaskbar(true)
        window.api.setAlwaysOnTop(true)
        // Enable overlay/transparent mode
        document.body.classList.add('overlay-mode')
        window.api.setOverlayMode(true)

        if (mounted) setInterviewActive(true)
        if (mounted) sessionStartedRef.current = true
      } catch (err) {
        if (mounted) setError((err as Error).message)
      }
    }

    initSession()

    return () => {
      mounted = false
      mountedRef.current = false
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount — only runs if session was actually started
  useEffect(() => {
    return () => {
      if (sessionStartedRef.current) {
        // Save interview session before teardown (covers window-close scenario;
        // the Exit button in Titlebar saves first then resets the store, so
        // getState() will return empty qaPairs — no duplicate save).
        const state = useInterviewStore.getState()
        if (state.qaPairs.length > 0 || state.transcriptions.length > 0) {
          useSessionStore.getState().saveSession({
            id: crypto.randomUUID(),
            date: Date.now(),
            duration: state.elapsedSeconds,
            qaPairs: [...state.qaPairs],
            transcriptions: [...state.transcriptions]
          })
        }

        stopAudioPipeline()
        stopScreenCapture()
        api.interviewEnd().catch(() => {})
        // Platform modules handle the correct teardown order internally
        window.api.setContentProtection(false)
        window.api.setSkipTaskbar(false)
        window.api.setAlwaysOnTop(false)
        document.body.classList.remove('overlay-mode')
        window.api.setOverlayMode(false)
        sessionStartedRef.current = false
      }
    }
  }, [])

  // Handle audio source switch from navbar (via store)
  useEffect(() => {
    if (isInterviewActive) {
      switchAudioSource(audioSource).catch((err) => setError((err as Error).message))
    }
  }, [audioSource, isInterviewActive, setError])

  const handleCopyCode = async (): Promise<void> => {
    if (!codeSuggestion?.suggestion) return
    try {
      await navigator.clipboard.writeText(codeSuggestion.suggestion)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may not be available
    }
  }

  const handleScreenAnalysisToggle = (): void => {
    if (!screenCaptureInitializedRef.current) return
    if (screenAnalysisEnabled) {
      pauseScreenCapture()
      setScreenCaptureActive(false)
      setScreenAnalysisEnabled(false)
    } else {
      resumeScreenCapture()
      setScreenCaptureActive(true)
      setScreenAnalysisEnabled(true)
    }
  }

  const handleChatSubmit = (): void => {
    const text = chatInput.trim()
    if (!text || isProcessing) return
    setChatInput('')
    sendToAI(text)
  }

  return (
    <div className="h-full flex flex-col">

      {/* ── Status Bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-5 py-0 bg-gray-900 border-b border-gray-800/60 shrink-0 h-10">
        {/* Listening dot */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-2 h-2 rounded-full ${isInterviewActive ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs font-medium text-gray-400">
            {isInterviewActive ? 'Listening' : 'Starting...'}
          </span>
        </div>

        <div className="w-px h-4 bg-gray-800 mx-3 shrink-0" />

        {/* Audio source */}
        <div className="flex items-center gap-1.5 shrink-0">
          <AudioLines className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs text-gray-500">
            {audioSource === 'mic' ? 'Microphone' : 'System Audio'}
          </span>
        </div>

        {/* Screen capture indicator */}
        <div className="w-px h-4 bg-gray-800 mx-3 shrink-0" />
        <div className="flex items-center gap-1.5 shrink-0">
          <Monitor className={`w-3.5 h-3.5 ${screenCaptureActive ? 'text-emerald-400' : 'text-gray-600'}`} />
          <span className={`text-xs ${screenCaptureActive ? 'text-emerald-400' : 'text-gray-600'}`}>
            {screenCaptureActive ? 'Screen Active' : 'Screen Off'}
          </span>
        </div>

        {isProcessing && (
          <>
            <div className="w-px h-4 bg-gray-800 mx-3 shrink-0" />
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin shrink-0" />
              <span className="text-xs text-brand-400">Generating answer...</span>
            </div>
          </>
        )}

        {isAnalyzingScreen && (
          <>
            <div className="w-px h-4 bg-gray-800 mx-3 shrink-0" />
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
              <span className="text-xs text-emerald-400">Analyzing screen...</span>
            </div>
          </>
        )}
      </div>

      {/* ── Live Transcript Bar (below status bar) ────── */}
      <div className="shrink-0 border-b border-gray-800/60 bg-gray-900/60 px-5 py-1.5 flex items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${currentInterim ? 'bg-brand-400 animate-pulse' : 'bg-gray-700'}`} />
          <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Transcript</span>
        </div>
        <div className="w-px h-3.5 bg-gray-800 shrink-0" />
        <p className={`flex-1 text-xs leading-relaxed truncate ${
          currentInterim ? 'text-white italic' : transcriptions[0] ? 'text-white' : 'text-gray-400 italic'
        }`}>
          {currentInterim || transcriptions[0]?.text || 'Waiting for speech...'}
        </p>
      </div>

      {/* ── Main Content — 60/40 Split ──────────────────────── */}
      <div className="flex-1 flex overflow-hidden bg-gray-950/80">

        {/* ── Left Panel: AI Transcriptions & Answers (60%) ── */}
        <div className="w-[60%] flex flex-col border-r border-gray-800/60">

          {/* Empty state */}
          {qaPairs.length === 0 && !isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/10 to-purple-500/10 border border-brand-500/20 flex items-center justify-center mb-5">
                <Sparkles className="w-8 h-8 text-brand-400/50" />
              </div>
              <h3 className="text-lg font-semibold text-gray-300">Ready to Listen</h3>
              <p className="text-sm text-gray-500 mt-2 max-w-sm leading-relaxed">
                Speak or let the interviewer ask a question. AI will respond in real-time.
              </p>
            </div>
          )}

          {/* Processing — first answer loading */}
          {isProcessing && qaPairs.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="flex gap-1.5 mb-3">
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm text-gray-500">Generating answer...</span>
            </div>
          )}

          {/* All QA pairs — scrollable, chronological (oldest → newest at bottom) */}
          {qaPairs.length > 0 && (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {[...qaPairs].reverse().map((pair) => {
                const isLatest = pair.id === qaPairs[0].id
                return (
                  <div
                    key={pair.id}
                    className="rounded-2xl overflow-hidden border border-brand-500/30 shadow-[0_0_12px_rgba(99,102,241,0.06)] transition-all"
                  >
                    {/* Question — highlighted row */}
                    <div className="px-4 py-3 flex items-start gap-3 bg-gray-800/90">
                      <MessageSquare className="w-3.5 h-3.5 mt-1 shrink-0 text-gray-300" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Question</p>
                        <p className="text-sm leading-relaxed text-gray-100">{pair.question}</p>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-brand-500/20" />

                    {/* Answer row */}
                    <div className="px-4 py-3 flex items-start gap-3 bg-gradient-to-br from-brand-500/5 to-purple-500/5">
                      <Sparkles className="w-3.5 h-3.5 mt-1 shrink-0 text-brand-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-brand-400/60">Answer</p>
                        <div className="text-sm text-gray-100 leading-relaxed whitespace-pre-wrap">
                          {pair.answer}
                          {isLatest && isProcessing && (
                            <span className="inline-block w-0.5 h-[1em] bg-brand-400 ml-0.5 animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Auto-scroll anchor */}
              <div ref={qaBottomRef} />

              {/* Error — inline at bottom of list */}
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Error — when no QA pairs yet */}
          {error && qaPairs.length === 0 && (
            <div className="px-5 mt-4">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel: Code (40%) ──────────── */}
        <div className="w-[40%] flex flex-col">

          {/* Panel Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800/60 shrink-0">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Code</span>
            {isAnalyzingScreen && <Loader2 className="w-3 h-3 text-emerald-400/40 animate-spin ml-0.5" />}

            {/* Screen Analysis Toggle */}
            <button
              onClick={handleScreenAnalysisToggle}
              className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                screenAnalysisEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
              title={screenAnalysisEnabled ? 'Disable screen analysis' : 'Enable screen analysis'}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{screenAnalysisEnabled ? 'On' : 'Off'}</span>
            </button>

            {codeSuggestion?.language && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-400 uppercase">
                {codeSuggestion.language}
              </span>
            )}
            {codeSuggestion?.suggestion && (
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors"
              >
                {copied ? (
                  <><Check className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">Copied</span></>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>
                )}
              </button>
            )}
          </div>

          {/* Code content */}
          <div className="flex-1 overflow-auto">

            {/* Empty state — shown until first code arrives */}
            {!codeSuggestion && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <Monitor className="w-7 h-7 text-emerald-400/40" />
                </div>
                <h3 className="text-base font-semibold text-gray-400">Watching Your Screen</h3>
                <p className="text-xs text-gray-600 mt-2 max-w-[240px] leading-relaxed">
                  Code suggestions will appear here when coding activity is detected.
                </p>
              </div>
            )}

            {/* Code block — stays mounted once any suggestion arrives, content updated via ref only */}
            {codeSuggestion && (
              <div className="h-full bg-[#0d1117] p-4 overflow-auto">
                <pre ref={codePreRef} className="text-[10px] font-mono text-gray-200 leading-relaxed whitespace-pre-wrap break-words" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Chat Input (full-width, bottom) ──────────────── */}
      <div className="shrink-0 border-t border-gray-800/60 bg-gray-900/90 px-4 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit() } }}
            placeholder="Type a question or message..."
            className="flex-1 bg-gray-800/80 border border-gray-700/60 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all"
            disabled={isProcessing}
          />
          <button
            onClick={handleChatSubmit}
            disabled={!chatInput.trim() || isProcessing}
            className="p-2 rounded-lg bg-brand-500/20 border border-brand-500/30 text-brand-400 hover:bg-brand-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  )
}
