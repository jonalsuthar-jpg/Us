import { useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * How far the house's files have loaded (0…1), from three.js's loading
 * manager: the house, the sky, the furniture and the two of us.
 */
export function useHouseLoading(): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const m = THREE.DefaultLoadingManager;
    const before = { onProgress: m.onProgress, onLoad: m.onLoad };
    m.onProgress = (_url, loaded, total) => setProgress(total ? loaded / total : 0);
    m.onLoad = () => setProgress(1);
    return () => {
      m.onProgress = before.onProgress;
      m.onLoad = before.onLoad;
    };
  }, []);
  return progress;
}
