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
  edit?: import('./types').MediaEdit | null
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

/** Composer draft: attached media survives the camera → review → composer
 * round-trip (which remounts the composer). Cleared on successful post. */
export interface DraftMediaItem {
  url: string
  type: 'photo' | 'video'
  posterUrl?: string
  edit?: import('./types').MediaEdit | null
}

let draft: DraftMediaItem[] = []

export function getDraftMedia(): DraftMediaItem[] {
  return draft
}

export function setDraftMedia(d: DraftMediaItem[]) {
  draft = d
}

export function clearDraftMedia() {
  draft = []
}
