const {app,BrowserWindow,Menu,globalShortcut}=require('electron'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),profile=process.env.ZOOM_PROFILE||fs.mkdtempSync(path.join(os.tmpdir(),'delive-zoom-'));app.setPath('userData',profile);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const {clampZoom}=require('../dist-electron/electron/windowZoom');
for(const value of [undefined,null,NaN,Infinity,'1.3'])assert.equal(clampZoom(value),1);assert.equal(clampZoom(0),0.75);assert.equal(clampZoom(5),1.5);
require('../dist-electron/electron/main');
(async()=>{
 await app.whenReady();await delay(1800);const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));assert(win);win.show();win.focus();
 const js=s=>win.webContents.executeJavaScript(s,true),key=async(k,shift=false)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:k,modifiers:['meta',...(shift?['shift']:[])]});win.webContents.sendInputEvent({type:'keyUp',keyCode:k,modifiers:['meta']});await delay(100)};
 if(process.env.ZOOM_RESTART){assert.equal(win.webContents.getZoomFactor(),1.3);console.log('PASS restart 130%');return}
 await js(`localStorage.setItem('delive_last_seen_version','2.3.0')`);await win.reload();await delay(500);win.focus();
 await key('0');assert.equal(win.webContents.getZoomFactor(),1);await key('=');assert.equal(win.webContents.getZoomFactor(),1.1);await key('+',true);assert.equal(win.webContents.getZoomFactor(),1.2);await key('-');assert.equal(win.webContents.getZoomFactor(),1.1);
 await js(`document.querySelector('aside .lucide-settings').closest('button').click()`);await delay(200);await js(`document.querySelector('input')?.focus()`);await key('=');assert.equal(win.webContents.getZoomFactor(),1.2);
 await js(`var dialog=document.createElement('dialog');dialog.innerHTML='<input aria-label="zoom dialog input" />';document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus()`);await key('0');assert.equal(win.webContents.getZoomFactor(),1);await js(`document.querySelector('dialog').close();document.querySelector('dialog').remove()`);
 await js('electronAPI.captionToggle(true)');await delay(500);const caption=BrowserWindow.getAllWindows().find(w=>w!==win);assert(caption);assert.notEqual(caption.webContents.session,win.webContents.session);const font=await caption.webContents.executeJavaScript("getComputedStyle(document.querySelector('body')).fontSize");win.focus();
 for(let i=0;i<15;i++)await key('=');assert.equal(win.webContents.getZoomFactor(),1.5);assert.equal(caption.webContents.getZoomFactor(),1);assert.equal(await caption.webContents.executeJavaScript("getComputedStyle(document.querySelector('body')).fontSize"),font);
 const visible=await js(`(()=>{const buttons=[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});return buttons.some(b=>b.textContent.includes('保存'))})()`);assert(visible);
 for(let i=0;i<20;i++)await key('-');assert.equal(win.webContents.getZoomFactor(),0.75);await key('0');
 const menu=Menu.getApplicationMenu();assert(menu.getMenuItemById('zoomin'));menu.getMenuItemById('zoomin').click();assert.equal(win.webContents.getZoomFactor(),1.1);
 const other=new BrowserWindow({show:true,webPreferences:{partition:'zoom-other-window'}});await other.loadURL('data:text/html,<input autofocus>');other.focus();other.webContents.sendInputEvent({type:'keyDown',keyCode:'=',modifiers:['meta']});await delay(150);assert.equal(win.webContents.getZoomFactor(),1.1);menu.getMenuItemById('zoomin').click();assert.equal(win.webContents.getZoomFactor(),1.1);other.destroy();
 for(const accelerator of ['Command+=','Command+Plus','Command+-','Command+0'])assert.equal(globalShortcut.isRegistered(accelerator),false);
 win.focus();await key('=');await key('=');assert.equal(win.webContents.getZoomFactor(),1.3);assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'window-zoom.json'))).factor,1.3);
 fs.mkdirSync(path.join(root,'tmp/evidence/693'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/evidence/693/zoom.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(root,'tmp/evidence/693/electron.json'),JSON.stringify({ok:true,profile,factor:1.3,checks:['native key +=-0','input and modal focus','75–150% bounds','native menu','caption session isolation','non-main window ignored','no global zoom registration','persisted 130%']},null,2));console.log('PASS zoom '+profile);
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>app.exit(process.exitCode||0));
