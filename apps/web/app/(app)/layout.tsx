import { AppShell } from '@/components/app/app-shell';
import { NotificationsBridge } from '@/components/app/notifications-bridge';
import { SessionGate } from '@/components/app/session-gate';
import { SetupNotice } from '@/components/app/setup-notice';
import { LazyCallOverlay } from '@/components/call/lazy-call-overlay';
import { DrawBridge } from '@/components/draw/draw-bridge';
import { isConfigured } from '@/lib/env';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured) return <SetupNotice />;
  return (
    <SessionGate>
      <NotificationsBridge />
      <AppShell>{children}</AppShell>
      <LazyCallOverlay />
      <DrawBridge />
    </SessionGate>
  );
}
