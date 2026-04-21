interface RiskBadgeProps {
  score: number // 1=Low 2=Medium 3=High 4=Very High
}

const LEVELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Low',       color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  2: { label: 'Medium',    color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  3: { label: 'High',      color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  4: { label: 'Very High', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
}

export function RiskBadge({ score }: RiskBadgeProps) {
  const level = LEVELS[score] ?? LEVELS[3]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${level.color}`}>
      {level.label}
    </span>
  )
}
