"use strict";

const fs = require('fs')
const electron = require('electron');
const settings = require('electron-settings');
const ipc_main = electron.ipcMain;
const { app, BrowserWindow, Menu, Tray } = require('electron')
const path = require('path')
const got_the_lock = app.requestSingleInstanceLock();

var wscc = null, tray = null, data = {
	loaded: false
};

app.launcher.setBadgeCount = (count) => {
	data.msg_count = count; 
}
app.launcher.getBadgeCount = () => data.msg_count;

if (!got_the_lock) {
	return app.quit()
}

// Second instance behaviour
app.on('second-instance', (commandLine, workingDirectory) => {
	// Someone tried to run a second instance, we should focus our window.
	if (wscc.window) {
		if (wscc.window.isMinimized()) {
			wscc.window.restore();
		}
		wscc.window.show();
	}
})

// Panel icon
app.on('ready', () => {
	['show_notifications', 'close_to_tray', 'start_in_tray'].forEach((set_prop) => {
		if (!settings.has(set_prop)) {
			settings.set(set_prop, true);
		}
	});

	ipc_main.on('notification-shim', (e, msg) => {
		console.log(msg);
	});

	tray = new Tray(path.join(__dirname, 'assets/icons/icon-load.png'))
	const contextMenu = Menu.buildFromTemplate([{
			label: 'Toggle window show/hide',
			click: () => {
				if (wscc.isVisible()) {
					wscc.hide();
				} else {
					wscc.show();
				}
			}
		}, {
			label: 'Show notifications',
			type: 'checkbox',
			checked: settings.get('show_notifications'),
			click: (menu_item) => {
				settings.set('show_notifications', menu_item.checked);
			}
		}, {
			label: 'Close to tray',
			type: 'checkbox',
			checked: settings.get('close_to_tray'),
			click: (menu_item) => {
				settings.set('close_to_tray', menu_item.checked);
			}
		}, {
			label: 'Start in tray',
			type: 'checkbox',
			checked: settings.get('start_in_tray'),
			click: (menu_item) => {
				settings.set('start_in_tray', menu_item.checked);
			}
		},{
			label: 'Quit',
			click: () => {
				app.isQuiting = true;
				app.quit();
			}
		}
	])
	tray.setToolTip('WazApp.')
	tray.setContextMenu(contextMenu)
	tray.on("double-click", function(event){
		wscc.show();
	})
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('activate', function () {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (wscc === null) {
		createWindow()
	}
})

// Utility functions

global.osLinux = function (callback) {
	if (process.platform === 'linux') {
		return Function.bind.apply(callback, this, [].slice.call(arguments, 0));
	}
	return function () { };
}

function createWindow() {
	var mainScreen = electron.screen.getPrimaryDisplay();
	var dims = mainScreen.workAreaSize;

	// Create the browser window.
	wscc = new BrowserWindow({
		backgroundColor: '#2c2c2c',
		title: "WhatsApp",
		width: dims.width * .8,
		height: dims.height * .8,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'browser.js')
		},
		icon: path.join(__dirname, 'assets/icons/icon-load.png'),
		show: !settings.get('start_in_tray')
	})

	// wscc.setResizable(false);
	wscc.setMenuBarVisibility(false);

	// Set user agent of browser #avoid whatsapp error on chromium browser
	wscc.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.86 Safari/537.36")
	wscc.loadURL("https://web.whatsapp.com");

	// Notifications
	wscc.on('page-title-updated', osLinux((event, title) => {
		var msg_count = title.match(/\((\d+)\)/);
		msg_count = msg_count ? msg_count[1] : '';
		data.msg_count = parseInt(msg_count);
		if (data.msg_count > 0) {
			tray.setImage(path.join(__dirname, 'assets/icons/icon-msg.png'));
			wscc.setIcon(path.join(__dirname, 'assets/icons/icon-msg.png'));
		} else {
			if (data.content_loaded) {
				tray.setImage(path.join(__dirname, 'assets/icons/icon.png'));
				wscc.setIcon(path.join(__dirname, 'assets/icons/icon.png'));
			} else {
				tray.setImage(path.join(__dirname, 'assets/icons/icon-load.png'));
				wscc.setIcon(path.join(__dirname, 'assets/icons/icon-load.png'));
			}
		}
	}))

	wscc.on('close', function (event) {
	    if(!app.isQuiting && settings.get('close_to_tray')){
			event.preventDefault();
			wscc.hide();
		}
		return !settings.get('close_to_tray');
	})

	wscc.on('closed', function (event) {
		wscc = null;
	})

	wscc.webContents.on('dom-ready', function (e) {
		let js_content = fs.readFileSync(path.join(__dirname, 'assets/init.js'), 'utf8')
		let css_content = fs.readFileSync(path.join(__dirname, 'assets/styles.css'), 'utf8')
		js_content = js_content.replace('{MY_CUSTOM_STYLE}', '`' + css_content + '`')
		wscc.webContents.executeJavaScript(js_content);
	})

	// Open the DevTools.
	// wscc.webContents.openDevTools()

	wscc.webContents.on('did-finish-load', function () {
		data.content_loaded = true;
		tray.setImage(path.join(__dirname, 'assets/icons/icon.png'));
		wscc.setIcon(path.join(__dirname, 'assets/icons/icon.png'));
	})
}
