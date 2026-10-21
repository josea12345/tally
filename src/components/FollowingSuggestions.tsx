import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, navigate } from '../App'
import type { Profile } from '../lib/types'
import FollowButton from './FollowButton'

/**
 * The Following tab when it's empty: instead of a dead end, the
 * people and topics worth following — one tap each.
 */
export default function FollowingSuggestions({
  people,
  topics,
}: {
  people: Profile[]
  topics: Array<{ key: string; label: string; count: number }>
}) {
  const { user } = useAuth()
  const [followedTopics, setFollowedTopics] = useState<Set<string>>(new Set())
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const toggleTopic = async (key: string) => {
    if (!user || busyKey) return
    setBusyKey(key)
    if (followedTopics.has(key)) {
      const { error } = await supabase
        .from('topic_follows')
        .delete()
        .eq('user_id', user.id)
        .eq('topic_key', key)
      if (!error) {
        setFollowedTopics((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    } else {
      const { error } = await supabase
        .from('topic_follows')
        .insert({ user_id: user.id, topic_key: key })
      if (!error) setFollowedTopics((prev) => new Set(prev).add(key))
    }
    setBusyKey(null)
  }

  if (people.length === 0 && topics.length === 0) return null

  return (
    <div className="px-4 pb-10 pt-6">
      <h2 className="text-lg font-black tracking-tight">Make this tab yours</h2>
      <p className="mt-1 text-sm text-mute">
        Follow people with proven taste, or follow a topic and every new put-on about it lands here.
      </p>
      {people.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-black uppercase tracking-widest text-mute">
            People worth following
          </h3>
          <ul className="space-y-3">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <button onClick={() => navigate(`/profile/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{p.display_name ?? p.username}</span>
                    <span className="block truncate text-xs text-mute">@{p.username}</span>
                  </span>
                </button>
                <FollowButton followeeId={p.id} />
              </li>
            ))}
          </ul>
        </>
      )}
      {topics.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-black uppercase tracking-widest text-mute">
            Topics to follow
          </h3>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => {
              const on = followedTopics.has(t.key)
              return (
                <button
                  key={t.key}
                  onClick={() => toggleTopic(t.key)}
                  disabled={busyKey === t.key}
                  className={`rounded-full px-3.5 py-2 text-xs font-black transition disabled:opacity-50 ${
                    on ? 'bg-sig text-ink' : 'border border-line text-fog hover:border-sig'
                  }`}
                >
                  {t.label} · {t.count} {on ? '✓' : '+'}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
