import { createContext, useCallback, useState } from "react";
import Loader from "../components/common/Loader";

export const LoaderContext = createContext(null);

const MIN_SPIN_MS = 450;
const SUCCESS_HOLD_MS = 550;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Direct port of the vanilla build's showLoader() — a real, hard-won fix:
// the spinner has to wait on the ACTUAL async work, not a fixed timer, or
// the checkmark can show before an upload has genuinely finished.
export function LoaderProvider({ children }) {
  const [state, setState] = useState({ show: false, success: false, text: "" });

  const runWithLoader = useCallback(async (text, task) => {
    setState({ show: true, success: false, text });
    const start = Date.now();

    let result, error;
    try {
      result = task ? await task() : undefined;
    } catch (err) {
      error = err;
    }

    const elapsed = Date.now() - start;
    if (elapsed < MIN_SPIN_MS) await sleep(MIN_SPIN_MS - elapsed);

    if (!error) {
      setState((s) => ({ ...s, success: true }));
      await sleep(SUCCESS_HOLD_MS);
    }
    setState({ show: false, success: false, text: "" });

    if (error) throw error;
    return result;
  }, []);

  return (
    <LoaderContext.Provider value={{ runWithLoader }}>
      {children}
      <Loader show={state.show} success={state.success} text={state.text} />
    </LoaderContext.Provider>
  );
}
