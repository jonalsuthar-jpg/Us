import { AppShell } from '@/components/app/app-shell';
import { NotificationsBridge } from '@/components/app/notifications-bridge';
import { SessionGate } from '@/components/app/session-gate';
import { SetupNotice } from '@/components/app/setup-notice';
import { CallOverlay } from '@/components/call/call-overlay';
import { isConfigured } from '@/lib/env';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured) return <SetupNotice />;
  return (
    <SessionGate>
      <NotificationsBridge />
      <AppShell>{children}</AppShell>
      <CallOverlay />
    </SessionGate>
  );
}
