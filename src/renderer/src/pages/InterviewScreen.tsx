import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, MessageSquare, Sparkles, AudioLines, Code2, Monitor, Copy, Check } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useInterviewStore } from '../store/interviewStore'
import { startAudioPipeline, stopAudioPipeline, switchAudioSource } from '../services/audioPipeline'
import { startScreenCapture, stopScreenCapture, markFrameProcessing, markFrameProcessed } from '../services/screenCapture'
import { api } from '../services/api'
import { useState } from 'react'

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
    setProcessing,
    setError,
    setCodeSuggestion,
    setAnalyzingScreen,
    setScreenCaptureActive
  } = useInterviewStore()

  const qaTopRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionStartedRef = useRef(false)
  const isProcessingRef = useRef(false)
  const sendQueueRef = useRef<string[]>([])
  const screenAnalysisRef = useRef(false)
  const [copied, setCopied] = useState(false)

  // Auto-scroll to latest QA pair
  useEffect(() => {
    qaTopRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [qaPairs])

  // Keep isProcessingRef in sync so pipeline callbacks always read the current value
  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  // Handle screen frame capture — send to AI for code analysis
  const handleScreenFrame = useCallback(
    async (base64: string) => {
      if (screenAnalysisRef.current) {
        console.log('[ScreenPipeline] STAGE 2: skipping — previous analysis still in flight')
        return
      }
      console.log('[ScreenPipeline] STAGE 2: frame received, size:', Math.round(base64.length / 1024), 'KB')
      screenAnalysisRef.current = true
      markFrameProcessing()
      setAnalyzingScreen(true)

      try {
        console.log('[ScreenPipeline] STAGE 3: sending to /interview/code-suggest...')
        const result = await api.codeAnalyze(base64)
        console.log('[ScreenPipeline] STAGE 4: response received — detected:', result.detected, 'language:', result.language, 'suggestion length:', result.suggestion?.length ?? 0)
        if (result.detected && result.suggestion) {
          console.log('[ScreenPipeline] STAGE 5: setting code suggestion, context:', result.context)
          setCodeSuggestion({
            id: crypto.randomUUID(),
            detected: result.detected,
            language: result.language,
            context: result.context,
            suggestion: result.suggestion,
            explanation: result.explanation,
            timestamp: Date.now()
          })
        } else {
          console.log('[ScreenPipeline] STAGE 4: no coding content detected or empty suggestion — skipping UI update')
        }
      } catch (err) {
        console.error('[ScreenPipeline] STAGE 3 ERROR: code analysis failed:', (err as Error).message)
      } finally {
        screenAnalysisRef.current = false
        markFrameProcessed()
        setAnalyzingScreen(false)
        console.log('[ScreenPipeline] STAGE 5: analysis complete, pipeline ready for next frame')
      }
    },
    [setCodeSuggestion, setAnalyzingScreen]
  )

  // Send finalized text to AI — queues if already processing
  const sendToAI = useCallback(
    async (text: string) => {
      console.log('[Pipeline STAGE 8] sendToAI called, text:', JSON.stringify(text), '| isProcessing:', isProcessingRef.current, '| queueLen:', sendQueueRef.current.length)
      if (!text.trim()) { console.log('[Pipeline STAGE 8] empty text, skipping'); return }
      if (isProcessingRef.current) {
        console.log('[Pipeline STAGE 8] busy — pushed to queue, queue now:', sendQueueRef.current.length + 1)
        sendQueueRef.current.push(text)
        return
      }
      isProcessingRef.current = true
      setProcessing(true)
      setError(null)
      console.log('[Pipeline STAGE 8] → api.interviewAsk:', JSON.stringify(text))
      try {
        const res = await api.interviewAsk(text)
        console.log('[Pipeline STAGE 8] ← answer received, length:', res.answer?.length)
        addQAPair({
          id: crypto.randomUUID(),
          question: res.question,
          answer: res.answer,
          timestamp: Date.now()
        })
      } catch (err) {
        console.log('[Pipeline STAGE 8] ✗ interviewAsk error:', (err as Error).message)
        setError((err as Error).message)
      } finally {
        setProcessing(false)
        isProcessingRef.current = false
        const next = sendQueueRef.current.shift()
        if (next) { console.log('[Pipeline STAGE 8] processing queued item'); setTimeout(() => sendToAI(next), 0) }
      }
    },
    [addQAPair, setProcessing, setError]
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

        // Start screen capture pipeline
        try {
          await startScreenCapture(handleScreenFrame)
          if (mounted) setScreenCaptureActive(true)
        } catch (err) {
          console.error('[ScreenCapture] Failed to start:', (err as Error).message)
          // Screen capture failure is non-fatal — audio still works
        }

        // Bring interview window to front of all applications
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
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount — only runs if session was actually started
  useEffect(() => {
    return () => {
      if (sessionStartedRef.current) {
        stopAudioPipeline()
        stopScreenCapture()
        api.interviewEnd().catch(() => {})
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

  const latestQA = qaPairs[0] ?? null

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

      {/* ── Main Content — 60/40 Split ──────────────────────── */}
      <div className="flex-1 flex overflow-hidden bg-gray-950/80">

        {/* ── Left Panel: AI Transcriptions & Answers (60%) ── */}
        <div className="w-[60%] flex flex-col border-r border-gray-800/60 overflow-y-auto">

          {/* Empty state */}
          {!latestQA && !isProcessing && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
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
          {isProcessing && !latestQA && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="flex gap-1.5 mb-3">
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm text-gray-500">Generating answer...</span>
            </div>
          )}

          {/* Latest QA pair */}
          {latestQA && (
            <div ref={qaTopRef} className="px-5 py-5 space-y-4">

              {/* Question */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-gray-800/80 border border-gray-700/60 flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className="flex-1 bg-gray-900/60 border border-gray-800/70 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Question</p>
                  <p className="text-sm text-gray-200 leading-relaxed">{latestQA.question}</p>
                </div>
              </div>

              {/* Answer */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                </div>
                <div className="flex-1 bg-gradient-to-br from-brand-500/5 to-purple-500/5 border border-brand-500/20 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-semibold text-brand-400/60 uppercase tracking-widest mb-1.5">Answer</p>
                  <div className="text-sm text-gray-100 leading-relaxed whitespace-pre-wrap">
                    {latestQA.answer}
                  </div>
                </div>
              </div>

              {/* Processing next indicator */}
              {isProcessing && (
                <div className="flex items-center gap-2 pl-10 pt-1">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-brand-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-brand-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-brand-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-600">Processing next...</span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-5 mt-4">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel: Code Suggestions (40%) ──────────── */}
        <div className="w-[40%] flex flex-col">

          {/* Panel Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800/60 shrink-0">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Code Suggestions</span>
            {codeSuggestion?.language && (
              <span className="ml-auto px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-400 uppercase">
                {codeSuggestion.language}
              </span>
            )}
          </div>

          {/* Code suggestion content */}
          <div className="flex-1 overflow-y-auto">

            {/* Empty state — no suggestion yet */}
            {!codeSuggestion && !isAnalyzingScreen && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <Monitor className="w-7 h-7 text-emerald-400/40" />
                </div>
                <h3 className="text-base font-semibold text-gray-400">Watching Your Screen</h3>
                <p className="text-xs text-gray-600 mt-2 max-w-[240px] leading-relaxed">
                  AI is analyzing your screen content. Code suggestions will appear here when coding activity is detected.
                </p>
              </div>
            )}

            {/* Analyzing indicator */}
            {isAnalyzingScreen && !codeSuggestion && (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="flex gap-1.5 mb-3">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm text-gray-500">Analyzing screen content...</span>
              </div>
            )}

            {/* Code suggestion display */}
            {codeSuggestion && codeSuggestion.detected && (
              <div className="p-4 space-y-3">

                {/* Context */}
                {codeSuggestion.context && (
                  <div className="px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-800/50">
                    <p className="text-xs text-gray-400">{codeSuggestion.context}</p>
                  </div>
                )}

                {/* Code block */}
                <div className="rounded-xl overflow-hidden border border-gray-800/70">
                  {/* Code header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-800/50">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-3.5 h-3.5 text-emerald-400/70" />
                      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                        {codeSuggestion.language || 'Code'}
                      </span>
                    </div>
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors"
                      title="Copy code"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-green-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Code content */}
                  <div className="bg-[#0d1117] p-4 overflow-x-auto">
                    <pre className="text-sm font-mono text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                      <code>{codeSuggestion.suggestion}</code>
                    </pre>
                  </div>
                </div>

                {/* Explanation */}
                {codeSuggestion.explanation && (
                  <div className="px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                    <p className="text-xs text-emerald-300/70 leading-relaxed">{codeSuggestion.explanation}</p>
                  </div>
                )}

                {/* Analyzing next indicator */}
                {isAnalyzingScreen && (
                  <div className="flex items-center gap-2 pt-2">
                    <Loader2 className="w-3 h-3 text-emerald-400/50 animate-spin" />
                    <span className="text-[10px] text-gray-600">Analyzing next frame...</span>
                  </div>
                )}
              </div>
            )}

            {/* No code detected state */}
            {codeSuggestion && !codeSuggestion.detected && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-gray-800/30 border border-gray-800/50 flex items-center justify-center mb-4">
                  <Code2 className="w-7 h-7 text-gray-600" />
                </div>
                <h3 className="text-sm font-medium text-gray-500">No Code Detected</h3>
                <p className="text-xs text-gray-600 mt-1.5 max-w-[220px]">
                  Switch to a code editor or coding platform to see suggestions.
                </p>
                {isAnalyzingScreen && (
                  <div className="flex items-center gap-2 mt-3">
                    <Loader2 className="w-3 h-3 text-emerald-400/50 animate-spin" />
                    <span className="text-[10px] text-gray-600">Scanning...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Live Transcript Bar (full-width, bottom) ────── */}
      <div className="shrink-0 border-t border-gray-800/60 bg-gray-900/80 px-5 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${currentInterim ? 'bg-brand-400 animate-pulse' : 'bg-gray-700'}`} />
          <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Transcript</span>
        </div>
        <div className="w-px h-4 bg-gray-800 shrink-0" />
        <p className={`flex-1 text-xs leading-relaxed truncate ${
          currentInterim ? 'text-white italic' : transcriptions[0] ? 'text-white' : 'text-gray-400 italic'
        }`}>
          {currentInterim || transcriptions[0]?.text || 'Waiting for speech...'}
        </p>
      </div>
    </div>
  )
}
