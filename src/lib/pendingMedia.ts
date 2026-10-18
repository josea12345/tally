/** One-shot handoff for the camera → filter → composer flow. Not persisted. */

export interface PendingRawPhoto {
  blob: Blob
  name: string
}

export interface PendingUpload {
  url: string
  type: 'photo' | 'video'
}

let raw: PendingRawPhoto | null = null
let upload: PendingUpload | null = null

export function setPendingRawPhoto(blob: Blob, name: string) {
  raw = { blob, name }
}

export function takePendingRawPhoto(): PendingRawPhoto | null {
  const p = raw
  raw = null
  return p
}

export function setPendingUpload(u: PendingUpload) {
  upload = u
}

export function takePendingUpload(): PendingUpload | null {
  const p = upload
  upload = null
  return p
}
