type Scale = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;

export declare const colors: {
  plum: Scale & { 950: string };
  paper: { DEFAULT: string; raised: string; sunken: string; edge: string };
  rose: Scale;
  teal: Scale;
  gold: Scale;
  sage: Scale;
};

export type PartnerSlot = 'a' | 'b';
export declare const partner: Record<PartnerSlot, { name: 'rose' | 'teal'; base: string; strong: string; wash: string }>;
export declare const modules: Record<'talk' | 'connect' | 'plan' | 'memory' | 'growth', string>;
export declare const fonts: { display: string; sans: string };
export declare const type: Record<'hero' | 'title' | 'heading' | 'lead' | 'body' | 'small' | 'micro', [number, number]>;
export declare const radii: Record<'hair' | 'control' | 'sheet' | 'bubble' | 'pill', number>;
export declare const motion: {
  duration: Record<'quick' | 'base' | 'gentle' | 'slow' | 'breath', number>;
  ease: Record<'out' | 'inOut' | 'settle', [number, number, number, number]>;
};
