import { useCallback, useEffect, useState } from 'react';

export type Route = 'home' | 'start' | 'explore' | 'edit' | 'result';
const ROUTES: Route[] = ['home', 'start', 'explore', 'edit', 'result'];

function read(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'home';
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((r: Route) => {
    window.location.hash = r === 'home' ? '/' : `/${r}`;
  }, []);
  return [route, navigate];
}
