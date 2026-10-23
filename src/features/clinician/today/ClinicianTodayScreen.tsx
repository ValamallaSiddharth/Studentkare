import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useAuth } from '@/data/contexts/AuthContext';
import { navigate } from '@/lib/utils/workflowRouting';
import { ClinicianConsoleFrame } from '../shared/ClinicianConsoleFrame';
import { BookingRequestsPanel } from '../shared/BookingRequestsPanel';
import { ClinicianTodayViewModel } from './ClinicianTodayViewModel';
import { ClinicianCommandCenter } from './ClinicianCommandCenter';
import { defaultTodaySource } from './todaySource';
import type { ClinicianTodaySource } from './todaySource';
import { longDate, shortDate } from './todayModel';

/** The doctor's home (`/clinician`). */
export const ClinicianTodayScreen = observer(function ClinicianTodayScreen({ source }: { source?: ClinicianTodaySource }): React.ReactElement | null {
  const { user } = useAuth();
  const [viewModel] = useState(() => new ClinicianTodayViewModel(source ?? defaultTodaySource()));

  useEffect(() => { void viewModel.load(); }, [viewModel]);

  if (!user) return null;
  const date = viewModel.data?.date ?? viewModel.now;

  return (
    <ClinicianConsoleFrame current="today" context={longDate(date)} contextShort={shortDate(date)}>
      <ClinicianCommandCenter viewModel={viewModel} clinicianName={user.fullName} onNavigate={navigate} />
      <BookingRequestsPanel onChanged={() => void viewModel.load()} />
    </ClinicianConsoleFrame>
  );
});
