// Re-export shim: the shared dialog now lives in `components/ui/dialog`.
// Kept so existing `SettingsDialog` imports continue to work during/after the
// shared-component migration.
export { Dialog as SettingsDialog } from "../ui/dialog"
