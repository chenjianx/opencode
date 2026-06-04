// Centralized webview configuration.
//
// Defaults live here instead of being hardcoded inside components, and can be
// overridden at build time via Vite env vars (e.g. set VITE_RACCOON_LOGIN_URL
// in a `.env` file or the build environment).

const DEFAULT_RACCOON_LOGIN_URL = "http://10.4.196.193:5580"

/** Default Raccoon authentication server shown in the connect dialog. */
export const RACCOON_LOGIN_URL = import.meta.env.VITE_RACCOON_LOGIN_URL?.trim() || DEFAULT_RACCOON_LOGIN_URL
