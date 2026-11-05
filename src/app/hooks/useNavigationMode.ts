import { useEffect, useState } from 'react';
import { navigationModeForWidth, type NavigationMode } from '@/app/utils/navigation';

function currentWidth(): number {
  return typeof window === 'undefined' ? 0 : window.innerWidth;
}

export function useNavigationMode(): NavigationMode {
  const [width, setWidth] = useState(currentWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return navigationModeForWidth(width);
}
