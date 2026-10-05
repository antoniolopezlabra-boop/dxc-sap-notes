import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://ugywwrrxgktihqnldfho.supabase.co'
// Clave pública (anon) — la seguridad real la aplican las políticas RLS del servidor.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVneXd3cnJ4Z2t0aWhxbmxkZmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDM0NzAsImV4cCI6MjA5OTExOTQ3MH0._hUcjQTi7diToLuJCuB1OyjplLBXZEoH6bao6mefD3E'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function adminCall<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) {
        const j = await ctx.json()
        if (j?.error) msg = j.error
      }
    } catch { /* respuesta sin JSON */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

// PostgREST corta cada respuesta en max_rows (1000 en este proyecto) sin avisar.
// Para tablas que crecen, pagina con range() hasta traer todas las filas.
// `build` debe devolver una consulta NUEVA con orden determinista (p. ej. .order('id')).
type Page = { data: unknown[] | null; error: { message: string } | null }
type Rangeable = { range: (from: number, to: number) => PromiseLike<Page> }

export async function selectAll<T = unknown>(
  build: () => Rangeable,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) return { data: out, error }
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return { data: out, error: null }
}
