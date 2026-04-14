import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, User, Phone, ArrowLeft } from 'lucide-react'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import GoogleAuthButton from '../components/auth/GoogleAuthButton'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'

export default function CreateAccount(): React.JSX.Element {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [step, setStep] = useState<'form' | 'otp' | 'google-otp'>('form')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [googleOtp, setGoogleOtp] = useState(['', '', '', '', '', ''])
  const [googlePending, setGooglePending] = useState<{ email: string; name: string; googleId: string } | null>(null)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const googleOtpRefs = useRef<(HTMLInputElement | null)[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email address'
    if (!form.phone.trim()) errs.phone = 'Phone number is required'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Step 1: validate → send OTP
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await api.sendOtp({ name: form.name, email: form.email })
      setErrors({})
      setStep('otp')
    } catch (err) {
      setErrors({ submit: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  // Step 2 (email/password): verify OTP → register
  const handleVerifyOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setErrors({ otp: 'Please enter the full 6-digit code' }); return }
    setLoading(true)
    try {
      const res = await api.register({ name: form.name, email: form.email, phone: form.phone, password: form.password, otp: code })
      setAuth(res.user, res.token)
      navigate('/post-auth')
    } catch (err) {
      setErrors({ otp: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  // Google button: OAuth → if new user show OTP step, if returning log in directly
  const handleGoogleAuth = async (): Promise<void> => {
    setGoogleLoading(true)
    setErrors({})
    try {
      const res = await window.api.googleAuth()
      if (res.type === 'login') {
        setAuth(res.user, res.token)
        navigate('/post-auth')
      } else {
        // New Google user — need OTP verification
        setGooglePending({ email: res.email, name: res.name, googleId: res.googleId })
        setGoogleOtp(['', '', '', '', '', ''])
        setStep('google-otp')
      }
    } catch (err) {
      const raw = (err as Error).message
      if (raw !== 'Authentication cancelled') {
        const msg = raw.replace(/^Error invoking remote method '[^']+': Error: /, '')
        setErrors({ submit: msg })
      }
    } finally {
      setGoogleLoading(false)
    }
  }

  // Step 2 (Google): verify OTP → complete Google registration
  const handleVerifyGoogleOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const code = googleOtp.join('')
    if (code.length < 6) { setErrors({ otp: 'Please enter the full 6-digit code' }); return }
    if (!googlePending) return
    setLoading(true)
    try {
      const res = await api.completeGoogleRegistration({ email: googlePending.email, name: googlePending.name, googleId: googlePending.googleId, otp: code })
      setAuth(res.user, res.token)
      navigate('/post-auth')
    } catch (err) {
      setErrors({ otp: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  const handleOtpChange = (refs: React.MutableRefObject<(HTMLInputElement | null)[]>, setter: React.Dispatch<React.SetStateAction<string[]>>, index: number, value: string): void => {
    if (!/^\d*$/.test(value)) return
    setter(prev => { const u = [...prev]; u[index] = value.slice(-1); return u })
    setErrors({})
    if (value && index < 5) refs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (refs: React.MutableRefObject<(HTMLInputElement | null)[]>, values: string[], index: number, e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace' && !values[index] && index > 0) refs.current[index - 1]?.focus()
  }

  const handleResend = async (isGoogle: boolean): Promise<void> => {
    setLoading(true)
    setErrors({})
    if (isGoogle) setGoogleOtp(['', '', '', '', '', ''])
    else setOtp(['', '', '', '', '', ''])
    try {
      const name = isGoogle ? (googlePending?.name ?? '') : form.name
      const email = isGoogle ? (googlePending?.email ?? '') : form.email
      await api.sendOtp({ name, email })
    } catch (err) {
      setErrors({ otp: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  const verifyEmail = step === 'google-otp' ? googlePending?.email : form.email

  return (
    <div className="min-h-full flex items-center justify-center py-8 px-4 relative overflow-hidden">
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
      <div className="w-full max-w-md">
        {/* Back button */}
        <button
          onClick={() => {
            if (step === 'otp') { setStep('form'); setOtp(['','','','','','']) }
            else if (step === 'google-otp') { setStep('form'); setGooglePending(null); setGoogleOtp(['','','','','','']) }
            else navigate('/')
          }}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {step === 'form' ? 'Back to Dashboard' : 'Back to form'}
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">iG</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {step === 'form' ? 'Create Account' : 'Verify your email'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {step === 'form'
              ? 'Join innogarage.ai and ace your interviews'
              : `We sent a 6-digit code to ${verifyEmail}`}
          </p>
        </div>

        {step === 'form' ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Full Name" placeholder="John Doe" icon={<User className="w-4 h-4" />}
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
              <Input label="Email Address" type="email" placeholder="john@example.com" icon={<Mail className="w-4 h-4" />}
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
              <Input label="Phone Number" type="tel" placeholder="+1 234 567 890" icon={<Phone className="w-4 h-4" />}
                value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} />
              <Input label="Password" type="password" placeholder="••••••••" icon={<Lock className="w-4 h-4" />}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} />
              <Input label="Confirm Password" type="password" placeholder="••••••••" icon={<Lock className="w-4 h-4" />}
                value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} error={errors.confirmPassword} />
              {errors.submit && <p className="text-sm text-red-400 text-center">{errors.submit}</p>}
              <Button type="submit" className="w-full" loading={loading}>Send Verification Code</Button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-500">or</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            <GoogleAuthButton label="Sign up with Google" onClick={handleGoogleAuth} loading={googleLoading} />

            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{' '}
              <button onClick={() => navigate('/sign-in')} className="text-brand-400 hover:text-brand-300 font-medium">Sign in</button>
            </p>
          </>
        ) : (
          /* OTP step — used for both email/password and Google new-user flows */
          <form onSubmit={step === 'otp' ? handleVerifyOtp : handleVerifyGoogleOtp} className="space-y-6">
            <div className="flex justify-center gap-3">
              {(step === 'otp' ? otp : googleOtp).map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { (step === 'otp' ? otpRefs : googleOtpRefs).current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(step === 'otp' ? otpRefs : googleOtpRefs, step === 'otp' ? setOtp : setGoogleOtp, i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(step === 'otp' ? otpRefs : googleOtpRefs, step === 'otp' ? otp : googleOtp, i, e)}
                  className="w-11 h-14 text-center text-xl font-bold bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                />
              ))}
            </div>

            {errors.otp && <p className="text-sm text-red-400 text-center">{errors.otp}</p>}

            <Button type="submit" className="w-full" loading={loading}>
              Verify &amp; Create Account
            </Button>

            <p className="text-center text-sm text-gray-500">
              Didn&apos;t receive it?{' '}
              <button type="button" onClick={() => handleResend(step === 'google-otp')} disabled={loading}
                className="text-brand-400 hover:text-brand-300 font-medium disabled:opacity-50">
                Resend code
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
