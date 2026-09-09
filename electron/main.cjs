const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const DEV_SERVER_URL = "http://localhost:8080";
const distIndex = path.join(__dirname, "..", "dist", "index.html");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
  });

  if (fs.existsSync(distIndex)) {
    win.loadFile(distIndex);
  } else {
    win.loadURL(DEV_SERVER_URL);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
