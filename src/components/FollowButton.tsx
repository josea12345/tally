import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { notify } from '../lib/notify'

export default function FollowButton({ followeeId, onChange }: { followeeId: string; onChange?: () => void }) {
  const { user } = useAuth()
  const [following, setFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || user.id === followeeId) {
      setFollowing(null)
      return
    }
    let live = true
    supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('followee_id', followeeId)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setFollowing(!!data)
      })
    return () => {
      live = false
    }
  }, [user, followeeId])

  if (!user || user.id === followeeId || following === null) return null

  const toggle = async () => {
    setBusy(true)
    try {
      if (following) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('followee_id', followeeId)
        setFollowing(false)
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

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        toggle()
      }}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 text-sm font-black transition disabled:opacity-50 ${
        following ? 'border border-line bg-ink-3 text-fog' : 'bg-lime text-ink hover:bg-lime-dim'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
