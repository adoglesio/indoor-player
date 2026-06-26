const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: false,
    },
  });
  // Carrega o app React (em produção, use o build)
  win.loadURL('http://localhost:3001/play?playlistId=SEU_ID_AQUI');
}

app.whenReady().then(createWindow);