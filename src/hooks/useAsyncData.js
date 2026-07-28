import { useCallback, useEffect, useState } from "react";
import { toSafeErrorMessage, withQueryTimeout } from "../utils/errors";

export function useAsyncData(queryFn, deps = [], options = {}) {
  const depsKey = deps.map((item) => String(item ?? "")).join("|");
  const enabled = options.enabled !== false;
  const [state, setState] = useState({ data: null, loading: enabled, error: "" });
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setState({ data: null, loading: false, error: "" });
      return () => {
        active = false;
      };
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    withQueryTimeout(
      Promise.resolve().then(queryFn),
      options.timeoutMs || 15000,
      options.timeoutMessage || "This information took too long to load."
    )
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.info("Async query failed", error);
        if (active) setState({
          data: null,
          loading: false,
          error: toSafeErrorMessage(error, options.errorMessage || "We could not load this information right now.")
        });
      });
    return () => {
      active = false;
    };
  // queryFn is intentionally recreated by callers; depsKey/version are the stable query identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, enabled, options.errorMessage, options.timeoutMessage, options.timeoutMs, version]);

  return { ...state, refetch };
}
