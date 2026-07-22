import { useCallback, useEffect, useState } from "react";

export function useAsyncData(queryFn, deps = []) {
  const depsKey = deps.map((item) => String(item ?? "")).join("|");
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    queryFn()
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.info("Async query failed", error);
        if (active) setState({ data: null, loading: false, error: error.message || "Information could not be loaded." });
      });
    return () => {
      active = false;
    };
  // queryFn is intentionally recreated by callers; depsKey/version are the stable query identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, version]);

  return { ...state, refetch };
}
