import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, Circle, CircleDot, Paperclip, Upload,
  XCircle, FileText, Trash2, RotateCcw, Clock, AlarmClock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import type { NoteTrack, TrackStep, SystemRow, Profile, DelayLog } from '../lib/types'
import {
  daysStuck, fmtDate, fmtDateTime, ENV_LABELS, trackProgress,
  DELAY_REASONS, delayReasonLabel, businessDaysBetween,
} from '../lib/workflow'
import {
  Panel, Spinner, ErrorBox, PriorityChip, StatusChip, DelayChip, ProgressBar, Chip, Modal,
} from '../components/ui'

export default function TrackDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const [track, setTrack] = useState<NoteTrack | null>(null)
  const [steps, setSteps] = useState<TrackStep[]>([])
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [owner, setOwner] = useState<Profile | null>(null)
  const [delayLogs, setDelayLogs] = useState<DelayLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isOwner = session?.user.id === track?.admin_id
  const isStaff = profile?.role === 'superuser' || profile?.role === 'supervisor'

  const load = useCallback(async () => {
    const { data: t, error: tErr } = await supabase
      .from('note_tracks').select('*, system_groups(name)').eq('id', id).single()
    if (tErr || !t) { setError('Track no encontrado o sin permisos para verlo.'); setLoading(false); return }
    const [s, sys, own, dl] = await Promise.all([
      supabase.from('track_steps').select('*').eq('track_id', id).order('step_order'),
      supabase.from('systems').select('*').eq('group_id', t.group_id),
      supabase.from('profiles').select('*').eq('id', t.admin_id).maybeSingle(),
      supabase.from('step_delay_logs').select('*').eq('track_id', id).order('logged_at', { ascending: false }),
    ])
    setTrack(t as NoteTrack)
    setSteps((s.data as TrackStep[]) ?? [])
    setSystems((sys.data as SystemRow[]) ?? [])
    setOwner((own.data as Profile) ?? null)
    setDelayLogs((dl.data as DelayLog[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function openEvidence(path: string) {
    const { data, error } = await supabase.storage.from('evidencias').createSignedUrl(path, 3600)
    if (error || !data) { setError('No fue posible abrir la evidencia.'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function deleteTrack() {
    if (!track) return
    const { error: dErr } = await supabase.from('note_tracks').delete().eq('id', track.id)
    if (dErr) { setError(dErr.message); return }
    navigate('/notas')
  }

  // Reabre un seguimiento finalizado (completada o no_aplica) para volver a documentar.
  async function reopenTracking() {
    if (!track) return
    setError('')
    const sorted = [...steps].sort((a, b) => a.step_order - b.step_order)
    if (!sorted.length) return
    const now = new Date().toISOString()
    if (track.status === 'no_aplica') {
      const snote = sorted[0]
      const { error: sErr } = await supabase.from('track_steps')
        .update({ status: 'en_curso', completed_at: null, comment: null }).eq('id', snote.id)
      if (sErr) { setError(sErr.message); return }
      const { error: tErr } = await supabase.from('note_tracks').update({
        status: 'en_progreso', na_reason: null, na_evidence_path: null,
        completed_at: null, current_step_order: snote.step_order, last_progress_at: now,
      }).eq('id', track.id)
      if (tErr) { setError(tErr.message); return }
    } else if (track.status === 'completada') {
      const last = sorted[sorted.length - 1]
      const { error: sErr } = await supabase.from('track_steps')
        .update({ status: 'en_curso', completed_at: null }).eq('id', last.id)
      if (sErr) { setError(sErr.message); return }
      const { error: tErr } = await supabase.from('note_tracks').update({
        status: 'en_progreso', completed_at: null,
        current_step_order: last.step_order, last_progress_at: now,
      }).eq('id', track.id)
      if (tErr) { setError(tErr.message); return }
    }
    load()
  }

  if (loading) return <Spinner label="Cargando track…" />
  if (!track) return <div className="max-w-[560px] mx-auto mt-10"><ErrorBox msg={error || 'Track no encontrado.'} /></div>

  const days = daysStuck(track)
  const progress = trackProgress(steps)
  const currentStep = steps.find((s) => s.status === 'en_curso')

  return (
    <div className="flex flex-col gap-4 max-w-[1000px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/notas" className="btn btn-ghost no-underline px-3"><ArrowLeft size={15} /></Link>
        <div className="flex-1">
          <h1 className="m-0 text-[19px] font-extrabold flex items-center gap-2.5 flex-wrap">
            Nota {track.note_number}
            <PriorityChip p={track.priority} />
            <StatusChip s={track.status} />
            {track.status === 'en_progreso' && <DelayChip days={days} showOk />}
          </h1>
          <p className="m-0 text-xs text-[var(--muted)]">
            Grupo <b className="text-[var(--text)]">{track.system_groups?.name}</b>
            {isStaff && owner && <> · Administrador: <b className="text-[var(--text)]">{owner.full_name ?? owner.email}</b></>}
          </p>
        </div>
        {isOwner && (
          <button className="btn btn-danger px-3" title="Eliminar track" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Resumen */}
      <Panel bodyClass="p-4">
        <div className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Meta label="Inicio de seguimiento" value={fmtDate(track.start_date)} />
          <Meta label="Orden de transporte" value={track.transport_order ?? '—'} mono />
          <Meta label="SAROX" value={track.sarox ?? '—'} mono />
          <Meta label="Avance" value={<ProgressBar pct={progress.pct} />} />
          <Meta label="Sistemas del grupo" value={
            <div className="flex flex-wrap gap-1.5">
              {systems.map((s) => (
                <Chip key={s.id} fg="#bcd6ff" bg="rgba(77,141,255,.1)" bd="rgba(77,141,255,.35)">
                  {s.sid} · {ENV_LABELS[s.environment]}
                </Chip>
              ))}
            </div>
          } />
        </div>
        {track.observations && (
          <div className="mt-3 pt-3 border-t border-[var(--border)] text-[12.5px] text-[var(--muted)]">
            <b className="text-[var(--text)]">Observaciones:</b> {track.observations}
          </div>
        )}
      </Panel>

      {track.status === 'no_aplica' && (
        <Panel bodyClass="p-4">
          <div className="flex items-start gap-3">
            <XCircle size={20} className="shrink-0 mt-0.5" style={{ color: '#a8b6d4' }} />
            <div>
              <div className="font-bold">Nota no aplicable a este sistema</div>
              <div className="text-[12.5px] text-[var(--muted)] mt-1">Motivo: {track.na_reason ?? '—'}</div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {track.na_evidence_path && (
                  <button className="btn btn-ghost" onClick={() => openEvidence(track.na_evidence_path!)}>
                    <Paperclip size={13} /> Ver evidencia de la SNOTE
                  </button>
                )}
                {isOwner && (
                  <button className="btn btn-ghost" onClick={reopenTracking} title="Volver a documentar el seguimiento">
                    <RotateCcw size={13} /> Reabrir seguimiento
                  </button>
                )}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {track.status === 'completada' && (
        <Panel bodyClass="p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} style={{ color: '#34d399' }} />
            <div className="flex-1">
              <div className="font-bold" style={{ color: '#34d399' }}>Implementación concluida</div>
              <div className="text-[12.5px] text-[var(--muted)]">
                La nota se implementó en todos los ambientes del grupo. Finalizado el {fmtDateTime(track.completed_at)}.
              </div>
            </div>
            {isOwner && (
              <button className="btn btn-ghost shrink-0" onClick={reopenTracking} title="Volver a documentar el último paso">
                <RotateCcw size={13} /> Reabrir
              </button>
            )}
          </div>
        </Panel>
      )}

      {/* Stepper */}
      <Panel title={`Flujo de implementación · ${progress.done}/${progress.total} pasos`} icon={<FileText size={15} />} bodyClass="p-5">
        <div className="flex flex-col">
          {steps.map((s, i) => (
            <StepRow key={s.id} step={s} isLast={i === steps.length - 1} track={track}
              canAct={!!isOwner && track.status === 'en_progreso' && s.id === currentStep?.id}
              logs={delayLogs.filter((l) => l.step_id === s.id)}
              onDone={load} onOpenEvidence={openEvidence} setGlobalError={setError} />
          ))}
        </div>
      </Panel>

      {error && <ErrorBox msg={error} />}

      {confirmDelete && (
        <Modal title="Eliminar track" onClose={() => setConfirmDelete(false)} width={440}>
          <p className="mt-0 text-[13.5px] text-[var(--muted)]">
            Se eliminará el seguimiento de la nota <b className="text-[var(--text)]">{track.note_number}</b> para el
            grupo <b className="text-[var(--text)]">{track.system_groups?.name}</b>, incluyendo todos sus pasos.
            Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button className="btn btn-danger" onClick={deleteTrack}>Eliminar definitivamente</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Meta({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide font-bold text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-[13px] font-semibold ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

function StepRow({ step, isLast, track, canAct, logs, onDone, onOpenEvidence, setGlobalError }: {
  step: TrackStep
  isLast: boolean
  track: NoteTrack
  canAct: boolean
  logs: DelayLog[]
  onDone: () => void
  onOpenEvidence: (p: string) => void
  setGlobalError: (m: string) => void
}) {
  const { session } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [comment, setComment] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [delayReason, setDelayReason] = useState('')
  const [delayNote, setDelayNote] = useState('')
  const [delayDate, setDelayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [delayBusy, setDelayBusy] = useState(false)
  const [delayErr, setDelayErr] = useState('')

  const todayStr = new Date().toISOString().slice(0, 10)
  const [naMode, setNaMode] = useState(false)
  const [naReason, setNaReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const done = step.status === 'completado'
  const current = step.status === 'en_curso'
  // Último seguimiento documentado del paso: su inicio o la demora más reciente.
  const stepAnchorMs = Math.max(
    step.started_at ? new Date(step.started_at).getTime() : 0,
    step.delay_logged_at ? new Date(step.delay_logged_at).getTime() : 0,
  )
  const daysInStep = current && stepAnchorMs > 0
    ? businessDaysBetween(new Date(stepAnchorMs), new Date())
    : 0

  // Al volverse accionable (p.ej. tras reabrir un paso), precargar lo ya documentado.
  useEffect(() => {
    if (canAct) {
      setInputValue(step.input_value ?? '')
      setComment(step.comment ?? '')
      setDelayReason(step.delay_reason ?? '')
      setDelayNote(step.delay_note ?? '')
      setDocDate(new Date().toISOString().slice(0, 10))
      setNaMode(false)
    }
  }, [canAct, step.id, step.input_value, step.comment, step.delay_reason, step.delay_note])

  async function uploadFile(f: File): Promise<string> {
    const uid = session!.user.id
    const ext = f.name.split('.').pop() || 'png'
    const path = `${uid}/${track.id}/${step.step_key}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('evidencias').upload(path, f)
    if (error) throw new Error(`Error al subir evidencia: ${error.message}`)
    return path
  }

  async function completeStep() {
    setErr('')
    if (step.requires_input === 'transport_order' && !inputValue.trim()) {
      setErr('Captura el número de la Orden de Transporte para continuar.'); return
    }
    if (step.requires_input === 'sarox' && !inputValue.trim()) {
      setErr('Captura el número SAROX para continuar.'); return
    }
    if (!docDate) { setErr('Indica la fecha en que se realizó este paso.'); return }
    if (docDate > todayStr) { setErr('La fecha del paso no puede ser futura.'); return }
    setBusy(true)
    try {
      // Ancla del seguimiento = fecha DOCUMENTADA (no el momento del clic).
      // Permite capturar trabajo pasado sin que el semáforo se reinicie a hoy.
      const docIso = new Date(docDate + 'T12:00:00').toISOString()
      let evidencePath: string | null = null
      if (file) evidencePath = await uploadFile(file)

      const { error: sErr } = await supabase.from('track_steps').update({
        status: 'completado',
        completed_at: docIso,
        input_value: inputValue.trim() || null,
        comment: comment.trim() || null,
        evidence_path: evidencePath,
      }).eq('id', step.id)
      if (sErr) throw sErr

      const trackPatch: Record<string, unknown> = {
        current_step_order: step.step_order + 1,
        last_progress_at: docIso,
      }
      if (step.requires_input === 'transport_order') trackPatch.transport_order = inputValue.trim()
      if (step.requires_input === 'sarox') trackPatch.sarox = inputValue.trim()

      // ¿Hay paso siguiente?
      const { data: next } = await supabase.from('track_steps')
        .select('id').eq('track_id', track.id).eq('step_order', step.step_order + 1).maybeSingle()

      if (next) {
        const { error: nErr } = await supabase.from('track_steps')
          .update({ status: 'en_curso', started_at: docIso }).eq('id', next.id)
        if (nErr) throw nErr
      } else {
        trackPatch.status = 'completada'
        trackPatch.completed_at = docIso
      }

      const { error: tErr } = await supabase.from('note_tracks').update(trackPatch).eq('id', track.id)
      if (tErr) throw tErr
      onDone()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErr(m); setGlobalError('')
    } finally {
      setBusy(false)
    }
  }

  // Regresa el flujo un paso: reabre el paso anterior (conservando lo documentado)
  // y deja el paso actual como pendiente.
  async function goBack() {
    setErr(''); setBusy(true)
    try {
      const now = new Date().toISOString()
      const { data: prev, error: pErr } = await supabase.from('track_steps')
        .select('id').eq('track_id', track.id).eq('step_order', step.step_order - 1).maybeSingle()
      if (pErr) throw pErr
      if (!prev) throw new Error('No hay un paso anterior.')
      const { error: e1 } = await supabase.from('track_steps')
        .update({ status: 'pendiente', started_at: null }).eq('id', step.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('track_steps')
        .update({ status: 'en_curso', completed_at: null, started_at: now }).eq('id', prev.id)
      if (e2) throw e2
      const { error: e3 } = await supabase.from('note_tracks').update({
        status: 'en_progreso', current_step_order: step.step_order - 1,
        last_progress_at: now, completed_at: null,
      }).eq('id', track.id)
      if (e3) throw e3
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Documenta (o actualiza / limpia) el motivo de demora del paso. Documentar una
  // demora SÍ cuenta como seguimiento: el semáforo se ancla a la fecha documentada
  // (no al momento del clic), igual que al completar un paso.
  async function updateDelay() {
    setDelayErr('')
    if (delayReason && !delayDate) { setDelayErr('Indica la fecha del seguimiento.'); return }
    if (delayReason && delayDate > todayStr) { setDelayErr('La fecha de seguimiento no puede ser futura.'); return }
    setDelayBusy(true)
    try {
      if (!delayReason) {
        // limpiar demora del paso
        const { error } = await supabase.from('track_steps')
          .update({ delay_reason: null, delay_note: null, delay_logged_at: null }).eq('id', step.id)
        if (error) throw error
      } else {
        const loggedAt = new Date(delayDate + 'T12:00:00').toISOString()
        const { error: lErr } = await supabase.from('step_delay_logs').insert({
          track_id: track.id, step_id: step.id, admin_id: session!.user.id,
          reason: delayReason, note: delayNote.trim() || null, logged_at: loggedAt,
        })
        if (lErr) throw lErr
        const { error: sErr } = await supabase.from('track_steps').update({
          delay_reason: delayReason, delay_note: delayNote.trim() || null, delay_logged_at: loggedAt,
        }).eq('id', step.id)
        if (sErr) throw sErr
        const { error: tErr } = await supabase.from('note_tracks')
          .update({ last_progress_at: loggedAt }).eq('id', track.id)
        if (tErr) throw tErr
      }
      onDone()
    } catch (e) {
      setDelayErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDelayBusy(false)
    }
  }

  async function finishNotApplicable() {
    setErr('')
    if (!naReason.trim()) { setErr('Indica el motivo por el que la nota no puede implementarse.'); return }
    if (!file) { setErr('Adjunta la evidencia de la SNOTE (captura de pantalla) para finalizar.'); return }
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const evidencePath = await uploadFile(file)
      const { error: sErr } = await supabase.from('track_steps').update({
        status: 'completado',
        completed_at: now,
        comment: `NO APLICA — ${naReason.trim()}`,
        evidence_path: evidencePath,
      }).eq('id', step.id)
      if (sErr) throw sErr
      const { error: tErr } = await supabase.from('note_tracks').update({
        status: 'no_aplica',
        na_reason: naReason.trim(),
        na_evidence_path: evidencePath,
        last_progress_at: now,
        completed_at: now,
      }).eq('id', track.id)
      if (tErr) throw tErr
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-4">
      {/* Rail */}
      <div className="flex flex-col items-center">
        <div className="shrink-0 mt-0.5">
          {done
            ? <CheckCircle2 size={22} style={{ color: '#34d399' }} />
            : current
              ? <CircleDot size={22} style={{ color: '#4d8dff' }} className="pulse-dot rounded-full" />
              : <Circle size={22} style={{ color: '#31487a' }} />}
        </div>
        {!isLast && <div className="w-px flex-1 my-1" style={{ background: done ? '#1f7a55' : '#22385f' }} />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-5 ${isLast ? '' : ''}`}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`text-[13.5px] font-bold ${current ? '' : done ? '' : 'text-[var(--muted)]'}`}>
            {step.step_order}. {step.title}
          </span>
          {done && <span className="text-[11px] text-[var(--muted)]">{fmtDateTime(step.completed_at)}</span>}
          {current && track.status === 'en_progreso' && <DelayChip days={daysInStep} showOk />}
          {current && step.delay_reason && (
            <Chip fg="#241a05" bg="rgba(230,164,23,.9)" bd="#f2b32e">
              <AlarmClock size={11} /> {delayReasonLabel(step.delay_reason)}
            </Chip>
          )}
        </div>

        {(current || done) && step.description && (
          <div className="text-[12px] text-[var(--muted)] mt-1 max-w-[640px]">{step.description}</div>
        )}

        {/* Historial de demoras del paso */}
        {logs.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {logs.slice(0, 4).map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-[11.5px]">
                <Clock size={11} style={{ color: '#e6a417' }} className="shrink-0" />
                <span className="font-semibold" style={{ color: '#f0b940' }}>{delayReasonLabel(l.reason)}</span>
                <span className="text-[var(--muted)]">· seguimiento {fmtDate(l.logged_at)}</span>
                {l.note && <span className="text-[var(--muted)] italic truncate max-w-[280px]">“{l.note}”</span>}
              </div>
            ))}
            {logs.length > 4 && <span className="text-[11px] text-[var(--muted)]">+{logs.length - 4} registros anteriores</span>}
          </div>
        )}

        {done && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {step.input_value && (
              <Chip fg="#bcd6ff" bg="rgba(77,141,255,.1)" bd="rgba(77,141,255,.35)">
                {step.requires_input === 'transport_order' ? 'OT' : step.requires_input === 'sarox' ? 'SAROX' : 'Dato'}: {step.input_value}
              </Chip>
            )}
            {step.comment && <span className="text-[12px] text-[var(--muted)] italic">“{step.comment}”</span>}
            {step.evidence_path && (
              <button className="btn btn-ghost py-1 px-2.5 text-[11.5px]" onClick={() => onOpenEvidence(step.evidence_path!)}>
                <Paperclip size={12} /> Evidencia
              </button>
            )}
          </div>
        )}

        {/* Action zone */}
        {canAct && (
          <div className="mt-3 rounded-xl p-4 flex flex-col gap-3"
            style={{ background: 'rgba(77,141,255,.05)', border: '1px solid rgba(77,141,255,.25)' }}>
            {step.step_key === 'snote' && !naMode ? (
              <>
                <div className="text-[12.5px] text-[var(--muted)]">
                  ¿La SNOTE indica que la nota <b className="text-[var(--text)]">es implementable</b> en este sistema?
                </div>
                <div className="w-[200px]">
                  <label className="lbl">Fecha en que se evaluó *</label>
                  <input className="input" type="date" value={docDate} max={todayStr}
                    onChange={(e) => setDocDate(e.target.value)} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button className="btn btn-success" onClick={completeStep} disabled={busy}>
                    <CheckCircle2 size={14} /> Sí aplica — continuar flujo
                  </button>
                  <button className="btn btn-danger" onClick={() => setNaMode(true)} disabled={busy}>
                    <XCircle size={14} /> No aplica — finalizar
                  </button>
                </div>
                <FileInput file={file} setFile={setFile} label="Evidencia (opcional para continuar)" />
              </>
            ) : step.step_key === 'snote' && naMode ? (
              <>
                <div className="text-[12.5px] font-bold" style={{ color: '#fca5a5' }}>
                  Finalizar como NO APLICABLE
                </div>
                <div>
                  <label className="lbl">Motivo por el que no se implementará *</label>
                  <textarea className="input resize-y min-h-[60px]" value={naReason}
                    onChange={(e) => setNaReason(e.target.value)}
                    placeholder="Ej. La SNOTE indica que la nota no es válida para esta versión / componente…" />
                </div>
                <FileInput file={file} setFile={setFile} label="Evidencia de la SNOTE (obligatoria) *" />
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={() => setNaMode(false)} disabled={busy}>Regresar</button>
                  <button className="btn btn-danger" onClick={finishNotApplicable} disabled={busy}>
                    {busy ? 'Guardando…' : 'Confirmar: no aplica'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {step.requires_input && (
                  <div>
                    <label className="lbl">
                      {step.requires_input === 'transport_order' ? 'Número de Orden de Transporte (OT) *' : 'Número SAROX *'}
                    </label>
                    <input className="input font-mono" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                      placeholder={step.requires_input === 'transport_order' ? 'Ej. S4DK901234' : 'Ej. SAROX-2026-0158'} />
                  </div>
                )}
                <div className="w-[200px]">
                  <label className="lbl">Fecha en que se realizó *</label>
                  <input className="input" type="date" value={docDate} max={todayStr}
                    onChange={(e) => setDocDate(e.target.value)} />
                </div>
                <div>
                  <label className="lbl">Comentario (opcional)</label>
                  <input className="input" value={comment} onChange={(e) => setComment(e.target.value)}
                    placeholder="Notas del paso, referencia de correo, ticket…" />
                </div>
                <FileInput file={file} setFile={setFile} label="Evidencia (opcional)" />
                <div>
                  <button className="btn btn-primary" onClick={completeStep} disabled={busy}>
                    {busy ? 'Guardando…' : <><CheckCircle2 size={14} /> Completar paso</>}
                  </button>
                </div>
              </>
            )}

            {/* Documentar demora (disponible en cualquier paso en curso) */}
            {!naMode && (
              <div className="mt-1 rounded-lg p-3.5 flex flex-col gap-2.5"
                style={{ background: 'rgba(230,164,23,.07)', border: '1px solid rgba(230,164,23,.35)' }}>
                <div className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: '#f0b940' }}>
                  <AlarmClock size={14} /> ¿Este paso está demorado?
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <div className="flex-1 min-w-[220px]">
                    <label className="lbl">Motivo de la demora</label>
                    <select className="input" value={delayReason} onChange={(e) => setDelayReason(e.target.value)}>
                      <option value="">— Sin demora —</option>
                      {DELAY_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="w-[170px]">
                    <label className="lbl">Fecha de seguimiento</label>
                    <input className="input" type="date" value={delayDate} max={todayStr}
                      onChange={(e) => setDelayDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="lbl">Detalle (opcional)</label>
                  <input className="input" value={delayNote} onChange={(e) => setDelayNote(e.target.value)}
                    placeholder="Ej. Se solicitó aprobación a KOF el lunes, sin respuesta…" />
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn btn-warning" onClick={updateDelay} disabled={delayBusy}
                    title={delayReason ? 'Registrar seguimiento de la demora' : 'Quitar la demora del paso'}>
                    {delayBusy ? 'Guardando…' : <><AlarmClock size={14} /> {delayReason ? 'Actualizar demora' : 'Quitar demora'}</>}
                  </button>
                  {step.delay_logged_at && (
                    <span className="text-[11.5px] text-[var(--muted)]">
                      Último seguimiento: {fmtDate(step.delay_logged_at)}
                    </span>
                  )}
                </div>
                {delayErr && <ErrorBox msg={delayErr} />}
              </div>
            )}

            {step.step_order > 1 && !naMode && (
              <div className="pt-2 mt-1 border-t border-[rgba(77,141,255,.18)]">
                <button className="text-[12px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                  onClick={goBack} disabled={busy} title="Reabrir el paso anterior para corregir o agregar información">
                  <ArrowLeft size={13} /> Regresar al paso anterior
                </button>
              </div>
            )}
            {err && <ErrorBox msg={err} />}
          </div>
        )}
      </div>
    </div>
  )
}

function FileInput({ file, setFile, label }: { file: File | null; setFile: (f: File | null) => void; label: string }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      <label className="btn btn-ghost cursor-pointer inline-flex">
        <Upload size={13} /> {file ? file.name : 'Seleccionar archivo…'}
        <input type="file" className="hidden" accept="image/*,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {file && (
        <button className="ml-2 text-[11.5px] text-[var(--muted)] hover:text-[#fca5a5] cursor-pointer"
          onClick={() => setFile(null)}>quitar</button>
      )}
    </div>
  )
}
