import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Crown, Zap, Star } from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { api } from '../services/api'

const plans = [
  {
    type: 'daily',
    name: '1 Day Pass',
    price: '$10',
    period: '/day',
    features: [
      'Full AI interview assistance',
      'Real-time code suggestions',
      'Unlimited questions',
      'Email support'
    ],
    icon: Zap,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/30',
    iconColor: 'text-blue-400',
    recommended: false
  },
  {
    type: 'weekly',
    name: '1 Week Pass',
    price: '$50',
    period: '/week',
    features: [
      'Everything in Daily',
      'Priority AI responses',
      'Interview analytics',
      'Practice mode',
      'Chat support'
    ],
    icon: Star,
    gradient: 'from-brand-500/20 to-purple-500/20',
    border: 'border-brand-500/30',
    iconColor: 'text-brand-400',
    recommended: false
  },
  {
    type: 'monthly',
    name: '1 Month Pass',
    price: '$150',
    period: '/month',
    features: [
      'Everything in Weekly',
      'Fastest AI responses',
      'Advanced analytics dashboard',
      'Custom AI personality',
      'Multiple interview profiles',
      'Priority support'
    ],
    icon: Crown,
    gradient: 'from-amber-500/20 to-orange-500/20',
    border: 'border-amber-500/30',
    iconColor: 'text-amber-400',
    recommended: true
  }
]

export default function UpgradePlan(): React.JSX.Element {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()
  const { plan: currentPlan, setPlan } = useProfileStore()

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/')
    }
  }, [isLoggedIn])

  const handleSubscribe = async (planType: string): Promise<void> => {
    try {
      const res = await api.subscribe(planType)
      setPlan(res.plan as typeof currentPlan)
      navigate('/post-auth')
    } catch {
      // Handle error
    }
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

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-white">Choose Your Plan</h1>
          <p className="text-sm text-gray-400 mt-1">
            Select the plan that best fits your interview schedule
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <Card
              key={p.type}
              className={`relative flex flex-col ${
                p.recommended ? 'border-brand-500/50 ring-1 ring-brand-500/20' : ''
              }`}
            >
              {p.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-brand-500 text-white text-xs font-semibold">
                  Recommended
                </div>
              )}

              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${p.gradient} border ${p.border} flex items-center justify-center mb-4`}
              >
                <p.icon className={`w-6 h-6 ${p.iconColor}`} />
              </div>

              <h3 className="text-lg font-semibold text-white">{p.name}</h3>
              <div className="flex items-baseline gap-1 mt-2 mb-4">
                <span className="text-3xl font-bold text-white">{p.price}</span>
                <span className="text-sm text-gray-500">{p.period}</span>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {p.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                variant={p.recommended ? 'primary' : 'secondary'}
                onClick={() => handleSubscribe(p.type)}
                disabled={currentPlan?.planType === p.type}
              >
                {currentPlan?.planType === p.type ? 'Current Plan' : 'Select Plan'}
              </Button>
            </Card>
          ))}
        </div>

        {currentPlan && (
          <p className="text-center text-sm text-gray-500 mt-6">
            Your current plan: <span className="text-brand-400 capitalize">{currentPlan.planType}</span>
            {' · '}
            Expires: {new Date(currentPlan.expiresAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  )
}
