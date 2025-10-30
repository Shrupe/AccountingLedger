const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Save data by sending it to main.js
  saveData: (key, data) => ipcRenderer.invoke('save-data', key, data),
  
  // Load data by requesting it from main.js
  loadData: (key) => ipcRenderer.invoke('load-data', key),
});
