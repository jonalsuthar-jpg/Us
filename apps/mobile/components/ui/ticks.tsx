import type { MessageStatus } from '@us/shared';
import { AlertCircle, Clock3 } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { usePalette } from './palette';

const LABEL = { sent: 'Sent', delivered: 'Delivered', read: 'Read' };

/** Same receipt language as web: one tick sent, two delivered, two teal read. */
export function Ticks({ status, pending, failed }: { status: MessageStatus; pending?: boolean; failed?: boolean }) {
  const c = usePalette();
  if (failed) return <AlertCircle size={14} color={c.roseStrong} accessibilityLabel="Not sent" />;
  if (pending) return <Clock3 size={12} color={c.inkMuted} accessibilityLabel="Sending" />;
  const color = status === 'read' ? (c.scheme === 'dark' ? '#50CBB9' : '#0A776D') : c.inkMuted;
  return (
    <Svg width={18} height={11} viewBox="0 0 18 11" accessibilityLabel={LABEL[status]}>
      <Path d="M1 6.2 4.3 9.4 11.2 1.6" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {status !== 'sent' && (
        <Path d="M7.4 8.6 8.3 9.4 15.2 1.6" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}
