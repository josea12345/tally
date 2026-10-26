import { supabase } from './supabase'
import type { Drop, PutOnRequest } from './types'

export interface RequestWithCount extends PutOnRequest {
  answerCount: number
}

type RawRequest = PutOnRequest & { answers?: Array<{ count: number }> }

function withCount(r: RawRequest): RequestWithCount {
  const { answers, ...rest } = r
  return { ...rest, answerCount: answers?.[0]?.count ?? 0 }
}

const REQUEST_SELECT =
  '*, author:profiles!put_on_requests_author_id_fkey(*), answers:request_answers(count)'

/** The open asks, newest first. */
export async function fetchRequests(limit = 100): Promise<RequestWithCount[]> {
  const { data } = await supabase
    .from('put_on_requests')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  return ((data ?? []) as RawRequest[]).map(withCount)
}

export async function fetchLatestRequest(): Promise<RequestWithCount | null> {
  const rows = await fetchRequests(1)
  return rows[0] ?? null
}

export async function fetchRequest(id: string): Promise<RequestWithCount | null> {
  const { data } = await supabase
    .from('put_on_requests')
    .select(REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle()
  return data ? withCount(data as RawRequest) : null
}

/** The drops offered as answers, oldest first (first put-on leads). */
export async function fetchAnswerDrops(requestId: string): Promise<Drop[]> {
  const { data } = await supabase
    .from('request_answers')
    .select('drop:drops(*, author:profiles!drops_author_id_fkey(*))')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .limit(100)
  return ((data ?? []) as unknown as Array<{ drop: Drop }>).map((r) => r.drop).filter(Boolean)
}

/** My answer row id on this request, if I've answered. */
export async function fetchMyAnswerId(requestId: string, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('request_answers')
    .select('id')
    .eq('request_id', requestId)
    .eq('answered_by', userId)
    .limit(1)
  return (data?.[0]?.id as string) ?? null
}

export async function createRequest(
  authorId: string,
  prompt: string,
  category: string | null,
  neighborhood: string | null,
): Promise<PutOnRequest | null> {
  const { data } = await supabase
    .from('put_on_requests')
    .insert({ author_id: authorId, prompt, category, neighborhood })
    .select('*, author:profiles!put_on_requests_author_id_fkey(*)')
    .single()
  return (data as PutOnRequest) ?? null
}

export async function answerWithDrop(
  requestId: string,
  dropId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('request_answers')
    .insert({ request_id: requestId, drop_id: dropId, answered_by: userId })
  return !error
}

export async function removeAnswer(answerId: string): Promise<void> {
  await supabase.from('request_answers').delete().eq('id', answerId)
}

export async function deleteRequest(id: string): Promise<void> {
  await supabase.from('put_on_requests').delete().eq('id', id)
}
