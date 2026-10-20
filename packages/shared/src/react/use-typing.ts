import { useCallback, useEffect, useMemo, useState } from 'react';
import { TypingReceiver, TypingSender } from '../realtime/typing';
import { useCouple } from './couple-provider';

/** Partner's typing state + handlers for my composer. Never touches the DB. */
export function useTyping() {
  const { channel, partner } = useCouple();
  const [partnerTyping, setPartnerTyping] = useState(false);

  const sender = useMemo(() => new TypingSender((t) => channel.sendTyping(t)), [channel]);

  useEffect(() => {
    const receiver = new TypingReceiver(setPartnerTyping);
    const offTyping = channel.typing.on((e) => {
      if (e.from === partner.id) receiver.receive(e.typing);
    });
    const offMessages = channel.messages.on(({ type, row }) => {
      if (type === 'INSERT' && row.sender_id === partner.id) receiver.clear();
    });
    return () => {
      offTyping();
      offMessages();
      receiver.dispose();
      sender.stop();
    };
  }, [channel, partner.id, sender]);

  const onComposerChange = useCallback((text: string) => sender.input(text), [sender]);
  const onComposerSent = useCallback(() => sender.stop(), [sender]);

  return { partnerTyping, onComposerChange, onComposerSent };
}
