import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import {
  Brain,
  Code2,
  MessageSquare,
  Sparkles,
  UserPlus,
  LogIn,
  ArrowRight,
  Shield,
  Zap,
  Globe
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export default function Dashboard(): React.JSX.Element {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()

  // Redirect authenticated users away from the landing page
  useEffect(() => {
    if (isLoggedIn) {
      navigate('/post-auth', { replace: true })
    }
  }, [isLoggedIn])

  return (
    <div className="min-h-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/40 via-gray-950 to-purple-900/20" />
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 mb-6">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-medium text-brand-300">AI-Powered Interview Assistant</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Ace Your Next Interview
            <br />
            <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
              with AI Assistance
            </span>
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
            Get real-time answers, code suggestions, and expert guidance during your interviews.
            Powered by advanced AI to help you land your dream job.
          </p>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mb-12">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">500+</div>
              <div className="text-xs text-gray-500">Questions Covered</div>
            </div>
            <div className="w-px h-10 bg-gray-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">50+</div>
              <div className="text-xs text-gray-500">Languages</div>
            </div>
            <div className="w-px h-10 bg-gray-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">98%</div>
              <div className="text-xs text-gray-500">Success Rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-5xl mx-auto px-6 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            {
              icon: Brain,
              title: 'AI-Powered Answers',
              desc: 'Get accurate, contextual answers to any interview question in real-time'
            },
            {
              icon: Code2,
              title: 'Code Assistant',
              desc: 'Write, debug, and optimize code with intelligent AI suggestions'
            },
            {
              icon: MessageSquare,
              title: 'Real-Time Suggestions',
              desc: 'Receive live prompts and talking points as the interview progresses'
            },
            {
              icon: Shield,
              title: 'Private & Secure',
              desc: 'Your data stays safe with enterprise-grade encryption and privacy'
            }
          ].map((feature) => (
            <Card key={feature.title} className="text-center p-5">
              <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-brand-500/10 flex items-center justify-center">
                <feature.icon className="w-5 h-5 text-brand-400" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">{feature.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{feature.desc}</p>
            </Card>
          ))}
        </div>

        {/* CTA Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Create Account Card */}
          <Card hover onClick={() => navigate('/create-account')} className="group">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
                <UserPlus className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">Create Account</h3>
                <p className="text-sm text-gray-400 mb-3">
                  New here? Set up your account in seconds and unlock access to AI-powered interview assistance.
                </p>
                <ul className="space-y-1.5 mb-4">
                  {['Free to get started', 'Personalized AI tuning', 'Resume-based preparation'].map(
                    (item) => (
                      <li key={item} className="flex items-center gap-2 text-xs text-gray-500">
                        <Zap className="w-3 h-3 text-green-400" />
                        {item}
                      </li>
                    )
                  )}
                </ul>
                <div className="flex items-center gap-1 text-sm font-medium text-brand-400 group-hover:text-brand-300 transition-colors">
                  Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Card>

          {/* Sign In Card */}
          <Card hover onClick={() => navigate('/sign-in')} className="group">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                <LogIn className="w-6 h-6 text-brand-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">Sign In</h3>
                <p className="text-sm text-gray-400 mb-3">
                  Welcome back! Sign in to continue your interview preparation journey.
                </p>
                <ul className="space-y-1.5 mb-4">
                  {['Resume where you left off', 'Access saved configurations', 'Quick email or Google sign-in'].map(
                    (item) => (
                      <li key={item} className="flex items-center gap-2 text-xs text-gray-500">
                        <Globe className="w-3 h-3 text-brand-400" />
                        {item}
                      </li>
                    )
                  )}
                </ul>
                <div className="flex items-center gap-1 text-sm font-medium text-brand-400 group-hover:text-brand-300 transition-colors">
                  Sign In <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-4 text-center">
        <p className="text-xs text-gray-600">
          © 2026 innogarage.ai — AI-Powered Interview Assistant
        </p>
      </footer>
    </div>
  )
}
