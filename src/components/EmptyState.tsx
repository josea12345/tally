import Mascot from './Mascot'

export default function EmptyState({
  title,
  body,
  action,
  mood = 'sleepy',
  hideMascot = false,
}: {
  title: string
  body: string
  action?: React.ReactNode
  mood?: 'happy' | 'sleepy' | 'star'
  hideMascot?: boolean
}) {
  return (
    <div className="rise-in mx-auto max-w-sm px-6 py-16 text-center">
      {!hideMascot && (
        <Mascot mood={mood} className="pop-in mx-auto mb-5 h-24 w-24" />
      )}
      <h3 className="wordmark mb-2 text-2xl">{title}</h3>
      <p className="mb-6 text-sm leading-relaxed text-mute">{body}</p>
      {action}
    </div>
  )
}
