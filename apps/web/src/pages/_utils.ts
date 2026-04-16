export const usePathParam = (segmentFromEnd = 1): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const pathname = window.location.pathname;
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - segmentFromEnd];
};
