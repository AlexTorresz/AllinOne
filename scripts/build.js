'use strict';
// Gera dist/All in One-win32-x64/All in One.exe
//   1) empacota o app com o Electron (funciona no Windows e também em outros sistemas)
//   2) troca o ícone e os dados do .exe via resedit (JavaScript puro, sem precisar de Wine/rcedit)
const fs = require('fs');
const path = require('path');
const { packager } = require('@electron/packager');
const ResEdit = require('resedit');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

function patchExe(exePath) {
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);

  // ícone
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'build', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const target = groups[0] ? { id: groups[0].id, lang: groups[0].lang } : { id: 1, lang: 1033 };
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, target.id, target.lang, ico.icons.map((i) => i.data)
  );

  // nome e versão que aparecem nas propriedades do arquivo e no Gerenciador de Tarefas
  const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (vis[0]) {
    const vi = vis[0];
    const lang = (vi.lang !== undefined && vi.lang !== null) ? vi.lang : 1033;
    vi.setStringValues(
      { lang, codepage: 1200 },
      {
        ProductName: 'All in One',
        FileDescription: 'All in One',
        InternalName: 'All in One',
        OriginalFilename: 'All in One.exe',
        CompanyName: 'All in One',
        LegalCopyright: 'All in One',
      }
    );
    vi.outputToResourceEntries(res.entries);
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
}

(async () => {
  const appPaths = await packager({
    dir: root,
    name: 'All in One',
    platform: 'win32',
    arch: 'x64',
    out: path.join(root, 'dist'),
    overwrite: true,
    asar: true,
    prune: true,
    appVersion: pkg.version,
    ignore: [
      /^\/dist($|\/)/,
      /^\/node_modules($|\/)/,   // o app não usa pacotes em tempo de execução
      /^\/test($|\/)/,
      /^\/scripts($|\/)/,
      /^\/\.gitignore$/,
      /^\/README\.md$/,
      /^\/iniciar\.bat$/,
      /^\/construir-exe\.bat$/,
    ],
  });

  for (const dir of appPaths) {
    const exePath = path.join(dir, 'All in One.exe');
    try {
      patchExe(exePath);
      console.log('Icone aplicado em', exePath);
    } catch (err) {
      console.warn('Aviso: nao foi possivel trocar o icone do .exe:', err && err.message ? err.message : err);
    }
  }
  console.log('\nPronto:\n' + appPaths.join('\n'));
})().catch((err) => {
  console.error('\nFalha ao gerar o .exe:\n', err && err.message ? err.message : err);
  process.exit(1);
});
