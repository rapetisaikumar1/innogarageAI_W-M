// afterPack hook —
//   Windows: rewrites exe version info so Task Manager shows "Microsoft Edge"
//   macOS:   ad-hoc codesigns the .app bundle before DMG packaging so the
//            distributed DMG contains a signed app (bypasses Gatekeeper on install)
const path = require('path')
const { execFileSync } = require('child_process')

exports.default = async function (context) {
  if (context.electronPlatformName === 'win32') {
    // rcedit requires Wine when running on macOS/Linux (cross-compile).
    // On a native Windows build host it works directly. Gracefully skip if unavailable.
    const exeName = context.packager.appInfo.productFilename + '.exe'
    const exePath = path.join(context.appOutDir, exeName)

    console.log(`[afterPack] Patching version info for ${exeName}`)

    try {
      const { rcedit } = await import('rcedit')
      await rcedit(exePath, {
        'version-string': {
          FileDescription: 'Microsoft Edge',
          ProductName: 'Microsoft Edge',
          CompanyName: 'Microsoft Corporation',
          LegalCopyright: 'Copyright Microsoft Corporation. All rights reserved.',
          InternalName: 'msedge',
          OriginalFilename: 'msedge.exe'
        }
      })
      console.log('[afterPack] Version info patched successfully')
    } catch (err) {
      console.warn(`[afterPack] rcedit skipped: ${err.message}`)
      console.warn('[afterPack] Tip: on macOS/Linux install Wine to enable EXE metadata patching.')
      console.warn('[afterPack] The app will still work — Task Manager will show default EXE info.')
    }
  } else if (context.electronPlatformName === 'darwin') {
    // Ad-hoc sign the .app bundle before electron-builder packages it into the DMG.
    // This means the final DMG ships with a signed app — users won't need to run
    // a manual codesign command after installing.
    const appName = context.packager.appInfo.productFilename + '.app'
    const appPath = path.join(context.appOutDir, appName)

    console.log(`[afterPack] Ad-hoc codesigning: ${appPath}`)
    execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath], { stdio: 'inherit' })
    console.log('[afterPack] Ad-hoc codesign complete')
  }
}
