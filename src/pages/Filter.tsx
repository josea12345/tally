import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../App'
import { takePendingRawMedia } from '../lib/pendingMedia'
import PhotoReview from '../components/PhotoReview'

/**
 * /filter route — only used by the native-camera fallback path (browser
 * wouldn't grant camera access). Renders the same in-place review the
 * in-app camera uses, so both paths feel identical.
 */
export default function Filter() {
  const { user } = useAuth()
  const [blob, setBlob] = useState<Blob | null>(null)

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    const pending = takePendingRawMedia()
    if (!pending || pending.kind !== 'photo') {
      navigate('/camera')
      return
    }
    setBlob(pending.blob)
  }, [user])

  if (!blob) return null

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <PhotoReview
        blob={blob}
        onRetake={() => navigate('/camera')}
        onDone={() => navigate('/create')}
      />
    </div>
  )
}
