; Sentinel uninstall hook (Tauri NSIS "installerHooks").
; The app registers itself for autostart by writing HKCU\...\Run\Sentinel, which
; the installer does not know about, so it must be removed here or a ghost entry
; stays behind after uninstall.
!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Sentinel"
!macroend
