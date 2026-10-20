import { describeCall, formatClock, type Message } from '@us/shared';
import { Phone, PhoneMissed, Video } from 'lucide-react';
import { cn } from '@/lib/cn';

/** A call in the thread. Missed calls are a "call back" button. */
export function CallEntry({
  message,
  myId,
  onCallBack,
}: {
  message: Message;
  myId: string;
  onCallBack: (media: 'audio' | 'video') => void;
}) {
  const call = message.call;
  if (!call) return null;
  const { label, missed, detail } = describeCall(call, myId);
  const Icon = missed ? PhoneMissed : call.media === 'video' ? Video : Phone;

  const body = (
    <>
      <Icon className="h-4 w-4" aria-hidden />
      <span className="font-medium">{label}</span>
      {detail && <span className="text-ink-muted">· {detail}</span>}
      <span className="text-ink-muted" suppressHydrationWarning>
        · {formatClock(call.created_at)}
      </span>
      {missed && <span className="ml-1 font-semibold underline underline-offset-2">Call back</span>}
    </>
  );

  return (
    <li className="my-4 flex justify-center">
      {missed ? (
        <button
          type="button"
          onClick={() => onCallBack(call.media)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-small text-rose-800',
            'transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
          )}
        >
          {body}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-sunken px-4 py-2 text-small text-ink-soft">
          {body}
        </span>
      )}
    </li>
  );
}
