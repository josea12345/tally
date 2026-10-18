export default function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="rise-in mx-auto max-w-sm px-6 py-16 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-3 text-3xl font-black text-lime">
        T
      </div>
      <h3 className="mb-2 text-xl font-black">{title}</h3>
      <p className="mb-6 text-sm leading-relaxed text-mute">{body}</p>
      {action}
    </div>
  )
}
