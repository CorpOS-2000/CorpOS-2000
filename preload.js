const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('corpOS', {
  quit: () => ipcRenderer.send('app-quit'),
  loadDataFile: (filename) => ipcRenderer.invoke('load-data-file', filename),
  saveDataFile: (filename, jsonString) => ipcRenderer.invoke('save-data-file', filename, jsonString),
  getDataDirPath: () => ipcRenderer.invoke('get-data-dir-path'),
  loadContentRegistryDisk: () => ipcRenderer.invoke('load-content-registry-disk'),
  writeContentPack: (payload, passphrase) => ipcRenderer.invoke('write-content-pack', payload, passphrase),
  listAssetsMusicFiles: () => ipcRenderer.invoke('list-assets-music-files'),
  onContentFileChanged: (callback) => {
    const listener = (_event, detail) => callback(detail);
    ipcRenderer.on('content-file-changed', listener);
    return () => ipcRenderer.removeListener('content-file-changed', listener);
  }
});
