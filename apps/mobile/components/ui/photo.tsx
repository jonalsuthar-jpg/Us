import { Image, type ImageProps } from 'expo-image';
import { cssInterop } from 'nativewind';

cssInterop(Image, { className: 'style' });

/**
 * A photo from one of our signed links, kept in memory and on disk. Links
 * change when they're renewed but a file's path never does, so pass the path
 * as `cacheKey` and a reopened screen draws from disk instead of downloading
 * it again.
 */
export function Photo({
  uri,
  cacheKey,
  fit = 'cover',
  ...props
}: Omit<ImageProps, 'source' | 'contentFit'> & { uri: string; cacheKey?: string | null; fit?: ImageProps['contentFit']; className?: string }) {
  return <Image source={{ uri, cacheKey: cacheKey ?? undefined }} contentFit={fit} cachePolicy="memory-disk" recyclingKey={cacheKey ?? uri} transition={100} {...props} />;
}
