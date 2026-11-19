import { describe, expect, it } from 'vitest';
import { firstLink, linkParts, linkPreviewOf, previewMeta } from '../src/api/links';

describe('linkParts', () => {
  it('leaves plain text alone', () => {
    expect(linkParts('see you at 8')).toEqual([{ text: 'see you at 8' }]);
  });

  it('finds links and leaves the sentence around them', () => {
    expect(linkParts('look https://example.com/a?b=1 now')).toEqual([
      { text: 'look ' },
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: ' now' },
    ]);
  });

  it('gives www. links a scheme', () => {
    expect(linkParts('www.example.com')).toEqual([{ text: 'www.example.com', href: 'https://www.example.com' }]);
  });

  it('drops punctuation that ends the sentence, keeps brackets that are part of the link', () => {
    expect(linkParts('Booked: https://example.com/table.')[1]).toEqual({ text: 'https://example.com/table', href: 'https://example.com/table' });
    expect(linkParts('(https://example.com)')[1]).toEqual({ text: 'https://example.com', href: 'https://example.com' });
    const wiki = 'https://en.wikipedia.org/wiki/Up_(2009_film)';
    expect(linkParts(`watch ${wiki}!`)[1]).toEqual({ text: wiki, href: wiki });
  });

  it('never makes a link of other schemes', () => {
    expect(linkParts('javascript:alert(1) and ftp://x').every((p) => !p.href)).toBe(true);
  });

  it('firstLink picks the first one', () => {
    expect(firstLink('a https://one.test b https://two.test')).toBe('https://one.test');
    expect(firstLink('nothing here')).toBeNull();
    expect(firstLink(null)).toBeNull();
  });
});

describe('link previews in a message', () => {
  it('round-trip through message details, and ignore a non-https picture', () => {
    const meta = previewMeta({ url: 'https://example.com', title: 'Example', host: 'example.com', image: 'http://example.com/a.png' });
    expect(linkPreviewOf(meta)).toEqual({ url: 'https://example.com', title: 'Example', host: 'example.com', description: undefined, image: undefined });
    expect(linkPreviewOf({ width: 3 })).toBeNull();
    expect(linkPreviewOf(null)).toBeNull();
  });
});
