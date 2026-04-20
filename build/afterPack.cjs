// afterPack hook — rewrites Windows exe version info so Task Manager
// shows "Microsoft Edge" instead of the real product name.
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return

  const { rcedit } = require('rcedit')
  const exeName = context.packager.appInfo.productFilename + '.exe'
  const exePath = path.join(context.appOutDir, exeName)

  console.log(`[afterPack] Patching version info for ${exeName}`)

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
}
