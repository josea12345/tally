import { useRef } from 'react'
import { navigate } from '../App'
import { setPendingRawPhoto } from '../lib/pendingMedia'

const MAX_BYTES = 20 * 1024 * 1024

/**
 * Instant camera capture. On mobile the file input's `capture` attribute opens
 * the native camera directly; the photo hands off to the filter screen.
 * Render-prop so the mobile nav and desktop rail can style the trigger freely.
 */
export default function CameraButton({
  children,
}: {
  children: (open: () => void) => React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const open = () => inputRef.current?.click()

  const onFile = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return
    if (f.size > MAX_BYTES) return
    setPendingRawPhoto(f, f.name || 'camera.jpg')
    navigate('/filter')
  }

  return (
    <>
      {children(open)}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          onFile(e.target.files?.[0])
          // reset so taking another photo re-fires onChange
          e.target.value = ''
        }}
      />
    </>
  )
}
