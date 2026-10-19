import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { notify } from '../lib/notify'

export default function FollowButton({ followeeId, onChange }: { followeeId: string; onChange?: () => void }) {
  const { user } = useAuth()
  const [following, setFollowing] = useState<boolean | null>(null)
  const [isPrivate, setIsPrivate] = useState(false)
  const [requested, setRequested] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || user.id === followeeId) {
      setFollowing(null)
      return
    }
    let live = true
    ;(async () => {
      const [{ data: f }, { data: p }, { data: r }] = await Promise.all([
        supabase.from('follows').select('id').eq('follower_id', user.id).eq('followee_id', followeeId).maybeSingle(),
        supabase.from('profiles').select('is_private').eq('id', followeeId).maybeSingle(),
        supabase.from('follow_requests').select('follower_id').eq('follower_id', user.id).eq('followee_id', followeeId).maybeSingle(),
      ])
      if (!live) return
      setFollowing(!!f)
      setIsPrivate(!!(p as { is_private?: boolean } | null)?.is_private)
      setRequested(!!r)
    })()
    return () => {
      live = false
    }
  }, [user, followeeId])

  if (!user || user.id === followeeId || following === null) return null

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (following) {
        setFollowing(false)
        const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('followee_id', followeeId)
        if (error) setFollowing(true) // rollback: DB still has the follow
      } else if (isPrivate) {
        if (requested) {
          setRequested(false)
          const { error } = await supabase.from('follow_requests').delete().eq('follower_id', user.id).eq('followee_id', followeeId)
          if (error) setRequested(true) // rollback
        } else {
          const { error } = await supabase
            .from('follow_requests')
            .insert({ follower_id: user.id, followee_id: followeeId })
          if (!error) {
            setRequested(true)
            void notify(followeeId, user.id, 'requested')
          }
        }
      } else {
        const { error } = await supabase.from('follows').insert({ follower_id: user.id, followee_id: followeeId })
        if (!error) {
          setFollowing(true)
          void notify(followeeId, user.id, 'follow')
        }
      }
      onChange?.()
    } finally {
      setBusy(false)
    }
  }

  const label = following ? 'Following' : isPrivate ? (requested ? 'Requested' : 'Request') : 'Follow'
  const active = following || requested

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        toggle()
      }}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 text-sm font-black transition disabled:opacity-50 ${
        active ? 'border border-line bg-ink-3 text-fog' : 'bg-lime text-ink hover:bg-lime-dim'
      }`}
    >
      {label}
    </button>
  )
}
