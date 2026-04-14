import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { api } from '../services/api'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import {
  UserCog,
  CreditCard,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react'

export default function PostAuth(): React.JSX.Element {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()
  const { profile, plan, setProfile, setPlan } = useProfileStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/')
      return
    }
    fetchStatus()
  }, [isLoggedIn])

  const fetchStatus = async (): Promise<void> => {
    try {
      const res = await api.getProfile()
      if (res.profile) setProfile(res.profile)
      if (res.plan) setPlan(res.plan)
    } catch {
      // If token expired, redirect to login
    } finally {
      setLoading(false)
    }
  }

  const isProfileUpdated = profile?.isUpdated ?? false
  const isPlanActive = plan !== null
  const canContinue = isProfileUpdated && isPlanActive

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

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
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Almost There!</h1>
          <p className="text-sm text-gray-400 mt-1">
            Complete these steps to start using innogarage.ai
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Update Account Card */}
          <Card
            hover
            onClick={() => navigate('/update-account')}
            className="group relative overflow-hidden"
          >
            {/* Status badge */}
            <div
              className={`absolute top-4 right-4 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                isProfileUpdated
                  ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                  : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
              }`}
            >
              {isProfileUpdated ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Updated
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3" />
                  Pending
                </>
              )}
            </div>

            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center mb-4">
              <UserCog className="w-6 h-6 text-blue-400" />
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">Update Profile</h3>
            <p className="text-sm text-gray-400 mb-4">
              Upload your resume, set job preferences, and configure AI settings for personalized
              interview assistance.
            </p>

            <div className="flex items-center gap-1 text-sm font-medium text-brand-400 group-hover:text-brand-300 transition-colors">
              {isProfileUpdated ? 'View Details' : 'Set Up Now'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>

          {/* Upgrade Plan Card */}
          <Card
            hover
            onClick={() => navigate('/upgrade-plan')}
            className="group relative overflow-hidden"
          >
            {/* Status badge */}
            <div
              className={`absolute top-4 right-4 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                isPlanActive
                  ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                  : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
              }`}
            >
              {isPlanActive ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Upgraded
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3" />
                  Pending
                </>
              )}
            </div>

            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mb-4">
              <CreditCard className="w-6 h-6 text-amber-400" />
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">Upgrade Plan</h3>
            <p className="text-sm text-gray-400 mb-4">
              Choose a plan that fits your needs. Get unlimited AI assistance for your upcoming
              interviews.
            </p>

            <div className="flex items-center gap-1 text-sm font-medium text-brand-400 group-hover:text-brand-300 transition-colors">
              {isPlanActive ? 'View Plan' : 'Choose Plan'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        </div>

        {/* Continue Button */}
        <div className="text-center">
          <Button
            size="lg"
            className="min-w-[200px]"
            disabled={!canContinue}
            onClick={() => navigate('/audio-permissions')}
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          {!canContinue && (
            <p className="text-xs text-gray-500 mt-2">
              Complete both steps above to continue
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
