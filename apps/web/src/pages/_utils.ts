import { useRouterState } from '@tanstack/react-router';

export const usePathParam = (segmentFromEnd = 1): string | undefined => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - segmentFromEnd];
};
