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
