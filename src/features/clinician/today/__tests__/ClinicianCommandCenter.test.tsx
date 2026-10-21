import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClinicianCommandCenter } from '../ClinicianCommandCenter';
import { ClinicianTodayViewModel } from '../ClinicianTodayViewModel';
import type { ClinicianTodaySource } from '../todaySource';
import { fullDay } from './todayFixture';
import { REVIEW_ROUTES } from '../../shared/reviewRoutes';

const NOW = new Date(2026, 9, 21, 9, 0);
afterEach(() => { vi.unstubAllEnvs(); });

async function setup(source: ClinicianTodaySource) {
  const viewModel = new ClinicianTodayViewModel(source, () => NOW);
  const onNavigate = vi.fn();
  render(<ClinicianCommandCenter viewModel={viewModel} clinicianName="Test doctor" onNavigate={onNavigate} />);
  await act(async () => { await viewModel.load(); });
  return { viewModel, onNavigate };
}

describe('ClinicianCommandCenter', () => {
  it('counts only appointment rows and keeps navigation on verified destinations', async () => {
    const { onNavigate } = await setup({ load: async () => fullDay(NOW) });
    expect(screen.getByRole('button', { name: "Today's Appointments 3" })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
    for (const [label, route] of [
      ['Open your schedule', 'clinician/schedule'], ['Check Inbox', 'clinician/inbox'],
      ['Review Pending Lab Reports', REVIEW_ROUTES.reportReviews()],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label ?? '' }));
      expect(onNavigate).toHaveBeenLastCalledWith(route);
    }
    for (const control of screen.getAllByRole('button', { name: /^(Start Consult|View EHR)$/ })) {
      expect(control).toHaveAttribute('aria-disabled', 'true');
      expect(control.getAttribute('title')).toContain('Coming soon');
      onNavigate.mockClear();
      fireEvent.click(control);
      expect(onNavigate).not.toHaveBeenCalled();
    }
  });

  it('shows an empty appointment list even when critical results are pending', async () => {
    await setup({ load: async () => ({ ...fullDay(NOW), slots: [], next: null, availability: null }) });
    expect(screen.getByText('No one on your list today.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Today's Appointments 0" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Critical Alerts 1' })).toHaveClass('cc-stat--urgent');
    const toggle = screen.getByRole('switch', { name: 'Available for Consultations' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/Local preference only/)).not.toBeInTheDocument();
  });

  it('keeps preview counts consistent and restores the live list', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await setup({ load: async () => ({ ...fullDay(NOW), slots: [], next: null }) });
    fireEvent.change(screen.getByLabelText('Development preview'), { target: { value: 'populated' } });
    expect(screen.getByRole('button', { name: "Today's Appointments 3" })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('In Progress')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Development preview'), { target: { value: 'empty' } });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Today's Appointments 0" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Development preview'), { target: { value: 'live' } });
    expect(screen.queryByText(/Preview only/)).not.toBeInTheDocument();
  });

  it('uses zero for failed counts and never changes connected availability on a rejected save', async () => {
    const setAvailability = vi.fn().mockRejectedValue(new Error('offline'));
    const data = fullDay(NOW);
    data.waiting.reportsToSign.count = null;
    await setup({ load: async () => data, setAvailability });
    expect(screen.getByRole('button', { name: 'Pending Lab Reviews 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry loading Pending Lab Reviews' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry loading Critical Alerts' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Some review counts could not be loaded/)).not.toBeInTheDocument();
    const toggle = screen.getByRole('switch');
    await act(async () => { fireEvent.click(toggle); });
    expect(setAvailability).toHaveBeenCalledWith('paused');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it.each(['production', 'test'])('hides development preview in %s', async (environment) => {
    vi.stubEnv('NODE_ENV', environment);
    await setup({ load: async () => fullDay(NOW) });
    expect(screen.queryByLabelText('Development preview')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retry loading/ })).not.toBeInTheDocument();
  });

  it('shows zero counts while initially loading without error retry controls', () => {
    const viewModel = new ClinicianTodayViewModel({ load: () => new Promise(() => undefined) });
    render(<ClinicianCommandCenter viewModel={viewModel} clinicianName="Doctor" onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pending Lab Reviews 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Critical Alerts 0' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retry loading/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('retries only the failed metric and keeps navigation and appointments available', async () => {
    const data = fullDay(NOW);
    data.waiting.reportsToSign.count = null;
    let resolveCount: (count: number) => void = () => undefined;
    const loadMetric = vi.fn(() => new Promise<number>(resolve => { resolveCount = resolve; }));
    const load = vi.fn(async () => data);
    const { onNavigate } = await setup({ load, loadMetric });
    const retry = screen.getByRole('button', { name: 'Retry loading Pending Lab Reviews' });
    fireEvent.click(retry);
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(loadMetric).toHaveBeenCalledWith('reportsToSign');
    expect(load).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pending Lab Reviews 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Critical Alerts 1' })).toBeInTheDocument();
    await act(async () => { resolveCount(5); });
    expect(screen.getByRole('button', { name: 'Pending Lab Reviews 5' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retry loading/ })).not.toBeInTheDocument();
  });

  it('refreshes shared data with an icon while retaining the list and zeroing pending counts', async () => {
    let resolveLoad: (data: ReturnType<typeof fullDay>) => void = () => undefined;
    const load = vi.fn<ClinicianTodaySource['load']>().mockResolvedValueOnce(fullDay(NOW))
      .mockImplementationOnce(() => new Promise(resolve => { resolveLoad = resolve; }));
    await setup({ load });
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh).toHaveAttribute('title', 'Refresh');
    expect(refresh.textContent).toBe('');
    fireEvent.click(refresh);
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute('aria-busy', 'true');
    expect(refresh.querySelector('.sk-btn__spinner')).not.toBeNull();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pending Lab Reviews 0' })).toBeInTheDocument();
    await act(async () => { resolveLoad(fullDay(NOW)); });
    expect(refresh).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pending Lab Reviews 3' })).toBeInTheDocument();
  });

  it('uses the error state and retries without displaying fabricated appointments', async () => {
    const load = vi.fn<ClinicianTodaySource['load']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(fullDay(NOW));
    await setup({ load });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
