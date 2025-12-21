const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Get the path to store user data (e.g., in AppData on Windows)
const userDataPath = app.getPath('userData');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // These are important for security
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
  
  // Open DevTools (optional, for debugging)
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- Data Handling ---

// Listen for a 'save-data' request from the renderer
ipcMain.handle('save-data', (event, key, data) => {
  try {
    const filePath = path.join(userDataPath, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); // Pretty-print JSON
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Failed to save data:', error);
    return { success: false, error: error.message };
  }
});

// Listen for a 'load-data' request from the renderer
ipcMain.handle('load-data', (event, key) => {
  try {
    const filePath = path.join(userDataPath, `${key}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data: JSON.parse(data) };
    }
    // If file doesn't exist, return empty array (default state)
    return { success: true, data: [] }; 
  } catch (error) {
    console.error('Failed to load data:', error);
    return { success: false, error: error.message, data: [] };
  }
});
