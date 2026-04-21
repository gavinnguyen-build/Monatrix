interface ILWarningProps {
  ilRisk: 'low' | 'medium' | 'high'
}

export function ILWarning({ ilRisk }: ILWarningProps) {
  if (ilRisk === 'low') return null

  const config = {
    medium: {
      color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
      label: 'Medium IL Risk',
      desc: 'One asset is a stablecoin. IL occurs if the other asset price changes significantly.',
    },
    high: {
      color: 'text-red-400 bg-red-400/10 border-red-400/20',
      label: 'High IL Risk',
      desc: 'Both assets are volatile. Large price divergence can cause significant impermanent loss.',
    },
  }

  const c = config[ilRisk]

  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${c.color}`}>
      <span className="mt-0.5">⚠</span>
      <div>
        <p className="font-semibold">{c.label}</p>
        <p className="opacity-80 mt-0.5">{c.desc}</p>
      </div>
    </div>
  )
}
