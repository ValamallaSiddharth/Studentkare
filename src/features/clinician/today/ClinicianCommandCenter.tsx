import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DestinationButton, SkButton, SkCard, StatusPill, SkToast, SkSkeleton } from '@/design-system';
import { Icon, Icon3d } from '@/design-system/icons';
import { useT } from '@/i18n';
import { REVIEW_ROUTES } from '../shared/reviewRoutes';
import { ClinicianTodayView } from './ClinicianTodayView';
import type { ClinicianTodayViewProps } from './ClinicianTodayView';
import { isConsult } from './todayModel';
import type { TodaySlot } from './todayModel';
import type { ReviewMetric } from './todaySource';
import './command-center.css';

// Page-local copy: shared catalogues are outside this change's permitted scope.
const COPY = {
  title: 'Your command center', appointments: "Today's Appointments", labs: 'Pending Lab Reviews',
  critical: 'Critical Alerts', next: 'Next Scheduled Session', none: 'None scheduled today',
  schedule: 'Open your schedule', inbox: 'Check Inbox', reviews: 'Review Pending Lab Reports',
  empty: 'No one on your list today.', emptyBody: 'When a student books an appointment or shares records, they will appear here.',
  available: 'Available for Consultations', on: 'On Duty', off: 'Off Duty',
  student: 'Student name', roll: 'Student/Roll ID', reason: 'Reason for visit', time: 'Slot time', status: 'Status', actions: 'Actions',
  unknown: 'Not reported', waiting: 'Waiting', completed: 'Completed', requested: 'Requested', missed: 'No show', progress: 'In Progress',
  consult: 'Start Consult', ehr: 'View EHR', soon: 'Coming soon',
  consultHint: 'Coming soon — the consult room cannot open a specific appointment yet.',
  ehrHint: 'Coming soon — a patient-specific EHR route is not available.',
  preview: 'Development preview', live: 'Live data', populated: 'Populated preview', emptyPreview: 'Empty preview',
  previewNotice: 'Preview only — synthetic appointments; review counts remain live.',
  queue: 'Open queue', refresh: 'Refresh', retry: 'Retry loading',
  sourceNote: 'Booking status is shown below. Check-in, in-progress status, roll IDs and visit reasons are not supplied by the current source.',
};

type QueueRow = TodaySlot & { rollId?: string; inProgress?: boolean };
// DEVELOPMENT MOCK DATA ONLY. Never selected or rendered in a production build.
const PREVIEW_ROWS: QueueRow[] = [
  { id: 'preview-waiting', title: 'Sample student A', time: '09:00', kind: 'booked', rollId: 'DEMO-001', meta: 'General consultation' },
  { id: 'preview-progress', title: 'Sample student B', time: '09:30', kind: 'booked', rollId: 'DEMO-002', meta: 'Follow-up', inProgress: true },
  { id: 'preview-completed', title: 'Sample student C', time: '10:00', kind: 'done', rollId: 'DEMO-003', meta: 'General consultation' },
];

function RowStatus({ row }: { row: QueueRow }): React.ReactElement {
  const label = row.inProgress ? COPY.progress : row.kind === 'done' ? COPY.completed
    : row.kind === 'requested' ? COPY.requested : row.kind === 'missed' ? COPY.missed : COPY.waiting;
  return <StatusPill tone={row.inProgress ? 'action' : row.kind === 'done' ? 'positive' : 'neutral'}>{label}</StatusPill>;
}

function RowActions(): React.ReactElement {
  return <div className="cc-actions">
    <SkButton variant="secondary" aria-disabled="true" title={COPY.consultHint}>{COPY.consult}</SkButton>
    <SkButton variant="secondary" aria-disabled="true" title={COPY.ehrHint}>{COPY.ehr}</SkButton>
  </div>;
}

function MetricRetry({ metric, label, busy, onRetry }: {
  metric: ReviewMetric;
  label: string;
  busy: boolean;
  onRetry: (metric: ReviewMetric) => Promise<void>;
}): React.ReactElement {
  const accessibleLabel = `${COPY.retry} ${label}`;
  return <SkButton variant="secondary" className="cc-icon-button cc-metric__retry"
    aria-label={accessibleLabel} title={accessibleLabel} busy={busy}
    onClick={() => { void onRetry(metric); }}>
    {!busy && <Icon name="refresh" size={16} />}
  </SkButton>;
}

export const ClinicianCommandCenter = observer(function ClinicianCommandCenter(props: ClinicianTodayViewProps): React.ReactElement {
  const { viewModel, onNavigate } = props;
  const t = useT();
  const [localAvailable, setLocalAvailable] = useState(false);
  const [preview, setPreview] = useState<'live' | 'empty' | 'populated'>('live');
  const { data, status } = viewModel;
  const loading = status === 'loading';
  const retrying = Object.values(viewModel.metricBusy).some(Boolean);

  const previewing = process.env.NODE_ENV === 'development' && preview !== 'live';
  const rows: QueueRow[] = previewing ? (preview === 'empty' ? [] : PREVIEW_ROWS) : (data?.slots.filter(isConsult) ?? []);
  const critical = data?.waiting.criticalResults.count;
  const reports = data?.waiting.reportsToSign.count;
  const connected = data?.availability != null;
  const taking = connected ? data?.availability === 'taking' : localAvailable;
  const next = previewing ? (rows.find(row => row.kind !== 'done')?.time ?? COPY.none)
    : data?.next ? data.next.startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : COPY.none;
  const stats = [
    { label: COPY.appointments, value: rows.length, route: 'clinician/queue' as const, urgent: false },
    { label: COPY.labs, value: loading || viewModel.metricBusy.reportsToSign ? 0 : reports ?? 0, route: REVIEW_ROUTES.reportReviews(), urgent: false, metric: 'reportsToSign' as const, failed: reports === null || status === 'error' },
    { label: COPY.critical, value: loading || viewModel.metricBusy.criticalResults ? 0 : critical ?? 0, route: REVIEW_ROUTES.criticalResults(), urgent: !loading && !viewModel.metricBusy.criticalResults && (critical ?? 0) > 0, metric: 'criticalResults' as const, failed: critical === null || status === 'error' },
    { label: COPY.next, value: next, route: 'clinician/schedule' as const, urgent: false },
  ];
  return <div className="cc-page">
    <header className="ct-head">
      <h1 className="ct-title">{COPY.title}</h1>
      <div className="cc-availability">
        <button type="button" role="switch" aria-label={COPY.available} aria-checked={taking}
          className={`ct-availability${taking ? ' is-on' : ''}`}
          disabled={loading || (connected && (!viewModel.canChangeAvailability || viewModel.availabilityBusy))}
          onClick={() => { if (connected) void viewModel.toggleAvailability(); else setLocalAvailable(value => !value); }}>
          <span className="ct-availability__dot" aria-hidden="true" />{COPY.available} · {taking ? COPY.on : COPY.off}
        </button>
        <SkButton variant="secondary" className="cc-icon-button" aria-label={COPY.refresh} title={COPY.refresh}
          busy={loading} disabled={retrying} onClick={() => { void viewModel.load(); }}>
          {!loading && <Icon name="refresh" size={18} />}
        </SkButton>
      </div>
    </header>
    <div className="cc-stats">
      {stats.map(stat => <div key={stat.label} className="cc-metric">
        <DestinationButton route={stat.route} onNavigate={onNavigate}
          className={`cc-stat sk-card${stat.urgent ? ' cc-stat--urgent' : ''}`}>
          <span>{stat.label}</span><strong className="sk-mono">{stat.value}</strong>
        </DestinationButton>
        {stat.metric && stat.failed && <MetricRetry metric={stat.metric} label={stat.label}
          busy={loading || viewModel.metricBusy[stat.metric]} onRetry={viewModel.retryMetric} />}
      </div>)}
    </div>
    <div className="cc-actions">
      <DestinationButton route="clinician/schedule" onNavigate={onNavigate} className="sk-btn sk-btn--primary">{COPY.schedule}</DestinationButton>
      <div className="cc-quick-links">
        <DestinationButton route={REVIEW_ROUTES.inbox()} onNavigate={onNavigate} className="sk-btn sk-btn--secondary">{COPY.inbox}</DestinationButton>
        <DestinationButton route={REVIEW_ROUTES.reportReviews()} onNavigate={onNavigate} className="sk-btn sk-btn--secondary">{COPY.reviews}</DestinationButton>
      </div>
    </div>
    {process.env.NODE_ENV === 'development' && <div className="cc-preview">
      <label htmlFor="cc-preview">{COPY.preview}</label>
      <select id="cc-preview" value={preview} onChange={event => {
        const value = event.target.value;
        if (value === 'live' || value === 'empty' || value === 'populated') setPreview(value);
      }}><option value="live">{COPY.live}</option><option value="empty">{COPY.emptyPreview}</option><option value="populated">{COPY.populated}</option></select>
      {previewing && <span role="status">{COPY.previewNotice}</span>}
    </div>}
    {status === 'error' ? <ClinicianTodayView {...props} /> : !data && loading ? (
      <div role="status" aria-busy="true" aria-label={t('clinToday.loading')}><SkSkeleton height={220} /></div>
    ) : !data ? <SkCard title={t('clinToday.unconnectedTitle')} subtitle={t('clinToday.unconnectedBody')} /> : rows.length === 0 ? <SkCard className="cc-empty">
      <Icon3d name="stetho-alt--p4" size={96} /><h2>{COPY.empty}</h2><p>{COPY.emptyBody}</p>
    </SkCard> : <SkCard title={COPY.appointments} labelledBy="cc-queue-title"
      action={<DestinationButton route="clinician/queue" onNavigate={onNavigate} className="sk-btn sk-btn--secondary">{COPY.queue}</DestinationButton>}>
      <p className="ct-subtitle">{COPY.sourceNote}</p>
      <table className="cc-table"><caption className="sk-visually-hidden">{COPY.appointments}</caption>
        <thead><tr>{[COPY.student, COPY.roll, COPY.reason, COPY.time, COPY.status, COPY.actions].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <th scope="row">{row.title}</th><td>{row.rollId ?? COPY.unknown}</td><td>{row.meta ?? COPY.unknown}</td>
          <td className="sk-mono">{row.time}</td><td><RowStatus row={row} /></td><td><RowActions /></td>
        </tr>)}</tbody>
      </table>
      <ul className="cc-mobile">{rows.map(row => <li key={row.id}>
        <h3>{row.title}</h3><dl>
          <dt>{COPY.roll}</dt><dd>{row.rollId ?? COPY.unknown}</dd><dt>{COPY.reason}</dt><dd>{row.meta ?? COPY.unknown}</dd>
          <dt>{COPY.time}</dt><dd className="sk-mono">{row.time}</dd><dt>{COPY.status}</dt><dd><RowStatus row={row} /></dd>
        </dl><RowActions />
      </li>)}</ul>
    </SkCard>}
    <SkToast message={viewModel.toast ? t(viewModel.toast.key, viewModel.toast.vars) : null} onDone={viewModel.clearToast} />
  </div>;
});
