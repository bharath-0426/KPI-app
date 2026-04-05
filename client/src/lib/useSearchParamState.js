import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Drop-in replacement for useState that syncs with URL search params.
 * Always returns strings; convert to number in the component if needed.
 * Uses { replace: true } so filter changes don't pollute browser history.
 */
export function useSearchParamState(key, defaultValue) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const value = raw !== null ? raw : String(defaultValue);

  const setValue = useCallback((newValue) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const str = String(newValue);
      if (str === String(defaultValue)) {
        next.delete(key);
      } else {
        next.set(key, str);
      }
      return next;
    }, { replace: true });
  }, [key, defaultValue, setSearchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue];
}
