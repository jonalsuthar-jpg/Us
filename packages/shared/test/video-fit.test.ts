import { describe, expect, it } from 'vitest';
import { isWideVideo, selfViewAspect, videoFit } from '../src/webrtc/video-fit';

const monitor = { width: 1920, height: 1080 };
const phone = { width: 390, height: 844 };
const laptopCamera = { width: 1280, height: 720 };
const phoneCamera = { width: 720, height: 1280 };

describe('videoFit', () => {
  it('fills until both sizes are known', () => {
    expect(videoFit(null, phone)).toBe('cover');
    expect(videoFit(laptopCamera, undefined)).toBe('cover');
    expect(videoFit({ width: 0, height: 0 }, phone)).toBe('cover');
  });

  it('shows the whole picture when the shapes differ', () => {
    expect(videoFit(laptopCamera, phone)).toBe('contain');
    expect(videoFit(phoneCamera, monitor)).toBe('contain');
  });

  it('fills when the shapes match', () => {
    expect(videoFit(laptopCamera, monitor)).toBe('cover');
    expect(videoFit(phoneCamera, phone)).toBe('cover');
    expect(videoFit({ width: 480, height: 640 }, phone)).toBe('cover');
  });

  it('fills when either side is near square', () => {
    expect(videoFit({ width: 640, height: 640 }, phone)).toBe('cover');
    expect(videoFit(laptopCamera, { width: 800, height: 760 })).toBe('cover');
  });
});

describe('isWideVideo', () => {
  it('is true only for a clearly wide picture', () => {
    expect(isWideVideo(laptopCamera)).toBe(true);
    expect(isWideVideo(phoneCamera)).toBe(false);
    expect(isWideVideo({ width: 640, height: 640 })).toBe(false);
    expect(isWideVideo(null)).toBe(false);
  });
});

describe('selfViewAspect', () => {
  it('follows the picture, within limits', () => {
    expect(selfViewAspect(null)).toBe(3 / 4);
    expect(selfViewAspect({ width: 640, height: 480 })).toBe(4 / 3);
    expect(selfViewAspect({ width: 3440, height: 1440 })).toBe(16 / 9);
    expect(selfViewAspect({ width: 400, height: 1000 })).toBe(9 / 16);
  });
});
