"use client";

const TRUSTED_DBLP_ORIGIN = "https://dblp.org";
const DEFAULT_TIMEOUT_MS = 15_000;
let callbackSequence = 0;

export type JsonpErrorCode = "NETWORK" | "TIMEOUT" | "INVALID_RESPONSE";

export class JsonpRequestError extends Error {
  readonly code: JsonpErrorCode;

  constructor(code: JsonpErrorCode, message: string) {
    super(message);
    this.name = "JsonpRequestError";
    this.code = code;
  }
}

export function jsonpRequest<T>(input: string | URL, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new JsonpRequestError("NETWORK", "DBLP JSONP is only available in the browser."));
  }

  const url = new URL(input.toString());
  if (url.origin !== TRUSTED_DBLP_ORIGIN) {
    return Promise.reject(new JsonpRequestError("NETWORK", "Untrusted JSONP origin."));
  }

  callbackSequence += 1;
  const callbackName = `__dblpJsonp_${Date.now()}_${callbackSequence}`;
  url.searchParams.set("callback", callbackName);

  return new Promise<T>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      Reflect.deleteProperty(window, callbackName);
    };
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };

    Object.defineProperty(window, callbackName, {
      configurable: true,
      value: (payload: T) => finish(() => resolve(payload)),
    });

    script.async = true;
    script.src = url.toString();
    script.onerror = () => finish(() => reject(
      new JsonpRequestError("NETWORK", "DBLP request failed."),
    ));
    script.onload = () => {
      if (!settled) {
        finish(() => reject(new JsonpRequestError(
          "INVALID_RESPONSE",
          "DBLP returned an invalid JSONP response.",
        )));
      }
    };
    const timer = setTimeout(() => finish(() => reject(
      new JsonpRequestError("TIMEOUT", "DBLP request timed out."),
    )), timeoutMs);

    document.head.appendChild(script);
  });
}
