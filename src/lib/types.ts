export type Role = 'superuser' | 'supervisor' | 'admin'
export type Env = 'DEV' | 'QAS' | 'PRE' | 'SBX' | 'PRD'
export type Priority = 'P1' | 'P2' | 'P3'
export type TrackStatus = 'en_progreso' | 'completada' | 'no_aplica'
export type StepStatus = 'pendiente' | 'en_curso' | 'completado'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  position: string | null
  role: Role
  status: 'active' | 'blocked'
  onboarded: boolean
  created_at: string
}

export interface SystemRow {
  id: string
  group_id: string
  sid: string
  environment: Env
}

export interface SystemGroup {
  id: string
  admin_id: string
  name: string
  description: string | null
  created_at: string
  systems?: SystemRow[]
}

export interface NoteTrack {
  id: string
  admin_id: string
  group_id: string
  note_number: string
  priority: Priority
  start_date: string
  observations: string | null
  status: TrackStatus
  transport_order: string | null
  sarox: string | null
  na_reason: string | null
  na_evidence_path: string | null
  current_step_order: number
  last_progress_at: string
  created_at: string
  completed_at: string | null
  system_groups?: { name: string } | null
}

export interface TrackStep {
  id: string
  track_id: string
  admin_id: string
  step_key: string
  step_order: number
  title: string
  description: string | null
  requires_input: 'transport_order' | 'sarox' | null
  input_value: string | null
  comment: string | null
  evidence_path: string | null
  status: StepStatus
  started_at: string | null
  completed_at: string | null
  delay_reason: string | null
  delay_note: string | null
  delay_logged_at: string | null
}

export interface DelayLog {
  id: string
  track_id: string
  step_id: string
  admin_id: string
  reason: string
  note: string | null
  logged_at: string
  created_at: string
}

export interface AdminUser extends Profile {
  groups: { id: string; admin_id: string; name: string }[]
  last_sign_in_at: string | null
}
