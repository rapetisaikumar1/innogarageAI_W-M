import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, FileText, X, History } from 'lucide-react'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { api } from '../services/api'

const experienceOptions = [
  { value: 'fresher', label: 'Fresher' },
  { value: '0-1', label: '0-1 Years' },
  { value: '1-3', label: '1-3 Years' },
  { value: '3-5', label: '3-5 Years' },
  { value: '5-10', label: '5-10 Years' },
  { value: '10+', label: '10+ Years' }
]

const interviewTypeOptions = [
  { value: 'technical', label: 'Technical' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'system-design', label: 'System Design' },
  { value: 'hr', label: 'HR' },
  { value: 'mixed', label: 'Mixed' }
]

export default function UpdateAccount(): React.JSX.Element {
  const navigate = useNavigate()
  const { user, isLoggedIn } = useAuthStore()
  const { profile, plan, setProfile } = useProfileStore()

  const [form, setForm] = useState({
    jobDescription: '',
    jobRole: '',
    experience: '',
    interviewType: '',
    company: '',
    language: 'English',
    endClient: '',
    aiInstructions: ''
  })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/')
      return
    }
    loadProfile()
  }, [isLoggedIn])

  const loadProfile = async (): Promise<void> => {
    try {
      const res = await api.getProfile()
      if (res.profile) {
        setProfile(res.profile)
        setForm({
          jobDescription: res.profile.jobDescription || '',
          jobRole: res.profile.jobRole || '',
          experience: res.profile.experience || '',
          interviewType: res.profile.interviewType || '',
          company: res.profile.company || '',
          language: res.profile.language || 'English',
          endClient: (res.profile as Record<string, unknown>).endClient as string || '',
          aiInstructions: res.profile.aiInstructions || ''
        })
      }
    } catch {
      // Handle error silently
    } finally {
      setPageLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (!allowed.includes(file.type)) {
      setError('Only PDF and Word documents are allowed')
      return
    }
    setResumeFile(file)
    setError('')
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!form.jobDescription.trim()) errors.jobDescription = 'Job description is required'
    if (!form.jobRole.trim()) errors.jobRole = 'Job role is required'
    if (!form.experience) errors.experience = 'Experience is required'
    if (!form.interviewType) errors.interviewType = 'Interview type is required'
    if (!form.company.trim()) errors.company = 'Company is required'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (): Promise<void> => {
    if (!validate()) return
    setLoading(true)
    setError('')
    try {
      if (resumeFile) {
        await api.uploadResume(resumeFile)
      }
      const profileData = {
        jobDescription: form.jobDescription,
        jobRole: form.jobRole,
        experience: form.experience,
        interviewType: form.interviewType,
        company: form.company,
        language: form.language,
        aiInstructions: form.aiInstructions
      }
      const res = await api.updateProfile(profileData)
      setProfile(res.profile as typeof profile)
      navigate('/post-auth')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (pageLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-full py-6 px-6 relative overflow-hidden">
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
      <button
        onClick={() => navigate('/post-auth')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-2xl font-bold text-white mb-6">Update Profile</h1>

      <div className="grid md:grid-cols-5 gap-8">
        {/* Left Panel — User Info (read-only) */}
        <div className="md:col-span-2">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 sticky top-6">
            <h2 className="text-lg font-semibold text-white mb-4">Account Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">Name</label>
                <p className="text-sm text-white mt-0.5">{user?.name || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">Email</label>
                <p className="text-sm text-white mt-0.5">{user?.email || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">Phone</label>
                <p className="text-sm text-white mt-0.5">{user?.phone || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">Language</label>
                <p className="text-sm text-white mt-0.5">{form.language}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">Plan</label>
                <p className="text-sm text-white mt-0.5">
                  {plan ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium capitalize">
                      {plan.planType}
                    </span>
                  ) : (
                    <span className="text-gray-500">No plan selected</span>
                  )}
                </p>
              </div>

            </div>

            {/* Past Sessions shortcut */}
            <div className="mt-5 pt-5 border-t border-gray-800">
              <button
                onClick={() => navigate('/past-sessions')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700 hover:border-brand-500/40 hover:bg-gray-800 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0 group-hover:border-brand-500/40 transition-colors">
                  <History className="w-4 h-4 text-brand-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Past Sessions</p>
                  <p className="text-xs text-gray-500">View your interview history</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Editable Form */}
        <div className="md:col-span-3 space-y-5">
          {/* Resume Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Resume (PDF or Word)
            </label>
            <div className="relative">
              <label
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-brand-500/50 transition-colors bg-gray-800/30"
              >
                {resumeFile ? (
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-brand-400" />
                    <span className="text-sm text-white">{resumeFile.name}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        setResumeFile(null)
                      }}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                ) : profile?.resumeFilename ? (
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-brand-400" />
                    <span className="text-sm text-brand-400">{profile.resumeFilename}</span>
                    <span className="text-xs text-gray-500 ml-1">· Click to replace</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-500 mb-2" />
                    <span className="text-sm text-gray-400">
                      Click to upload or drag and drop
                    </span>
                    <span className="text-xs text-gray-600 mt-1">PDF, DOC, DOCX</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </div>

          {/* Job Description */}
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${fieldErrors.jobDescription ? 'text-red-400' : 'text-gray-300'}`}>
              Job Description <span className="text-red-400">*</span>
            </label>
            <textarea
              className={`w-full bg-gray-800/50 border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 transition-colors min-h-[100px] resize-y ${
                fieldErrors.jobDescription
                  ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500'
                  : 'border-gray-700 focus:ring-brand-500/50 focus:border-brand-500'
              }`}
              placeholder="Paste the job description here..."
              value={form.jobDescription}
              onChange={(e) => {
                setForm({ ...form, jobDescription: e.target.value })
                if (fieldErrors.jobDescription) setFieldErrors({ ...fieldErrors, jobDescription: '' })
              }}
            />
            {fieldErrors.jobDescription && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.jobDescription}</p>
            )}
          </div>

          {/* Job Role */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Job Role <span className="text-red-400">*</span>
            </label>
            <Input
              placeholder="e.g., Frontend Developer"
              value={form.jobRole}
              error={fieldErrors.jobRole}
              onChange={(e) => {
                setForm({ ...form, jobRole: e.target.value })
                if (fieldErrors.jobRole) setFieldErrors({ ...fieldErrors, jobRole: '' })
              }}
            />
          </div>

          {/* Dropdowns */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Experience <span className="text-red-400">*</span>
              </label>
              <Select
                options={experienceOptions}
                value={form.experience}
                error={fieldErrors.experience}
                onChange={(e) => {
                  setForm({ ...form, experience: e.target.value })
                  if (fieldErrors.experience) setFieldErrors({ ...fieldErrors, experience: '' })
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Interview Type <span className="text-red-400">*</span>
              </label>
              <Select
                options={interviewTypeOptions}
                value={form.interviewType}
                error={fieldErrors.interviewType}
                onChange={(e) => {
                  setForm({ ...form, interviewType: e.target.value })
                  if (fieldErrors.interviewType) setFieldErrors({ ...fieldErrors, interviewType: '' })
                }}
              />
            </div>
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Company <span className="text-red-400">*</span>
            </label>
            <Input
              placeholder="e.g., Google"
              value={form.company}
              error={fieldErrors.company}
              onChange={(e) => {
                setForm({ ...form, company: e.target.value })
                if (fieldErrors.company) setFieldErrors({ ...fieldErrors, company: '' })
              }}
            />
          </div>

          {/* End Client */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              End Client <span className="text-xs text-gray-500 font-normal">(optional)</span>
            </label>
            <Input
              placeholder="e.g., JPMorgan Chase"
              value={form.endClient}
              onChange={(e) => setForm({ ...form, endClient: e.target.value })}
            />
          </div>

          {/* AI Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              AI Instructions
            </label>
            <textarea
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors min-h-[80px] resize-y"
              placeholder="Any specific instructions for the AI assistant..."
              value={form.aiInstructions}
              onChange={(e) => setForm({ ...form, aiInstructions: e.target.value })}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="secondary" onClick={() => navigate('/post-auth')}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={loading}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
