/** One-shot handoff for the camera → review → composer flow. Not persisted. */

export interface PendingRawMedia {
  blob: Blob
  name: string
  kind: 'photo' | 'video'
}

export interface PendingUpload {
  url: string
  type: 'photo' | 'video'
  posterUrl?: string
}

let raw: PendingRawMedia | null = null
let upload: PendingUpload | null = null

export function setPendingRawMedia(blob: Blob, name: string, kind: 'photo' | 'video') {
  raw = { blob, name, kind }
}

export function takePendingRawMedia(): PendingRawMedia | null {
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
