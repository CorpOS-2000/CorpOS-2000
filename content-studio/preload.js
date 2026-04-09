const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('corpStudio', {
  getSettings: () => ipcRenderer.invoke('studio-get-settings'),
  setSettings: (partial) => ipcRenderer.invoke('studio-set-settings', partial),
  readRegistry: () => ipcRenderer.invoke('studio-read-registry'),
  readFile: (name) => ipcRenderer.invoke('studio-read-file', name),
  writeFile: (name, content) => ipcRenderer.invoke('studio-write-file', name, content),
  validate: () => ipcRenderer.invoke('studio-validate'),
  backupZip: () => ipcRenderer.invoke('studio-backup-zip'),
  buildPack: (passphrase) => ipcRenderer.invoke('studio-build-pack', passphrase),
  openDataFolder: () => ipcRenderer.invoke('studio-open-data-folder'),
  pickAdAsset: (adId) => ipcRenderer.invoke('studio-pick-ad-asset', adId),
  deleteAdAssetFolder: (adId) => ipcRenderer.invoke('studio-delete-ad-asset-folder', adId),
  assetToDataUrl: (relativePath) => ipcRenderer.invoke('studio-asset-to-data-url', relativePath)
});
