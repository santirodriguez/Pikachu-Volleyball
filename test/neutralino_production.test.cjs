'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'desktop', 'neutralino', 'neutralino.config.json');
const PRELOAD_PATH = path.join(ROOT, 'desktop', 'neutralino', 'preload.js');
const EXTERNAL_LINK_EXTENSION_ID = 'com.santirodriguez.pikachuvolleyball.externallinks';
const readConfig = () => JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
function createPreloadHarness() {
  const errors=[]; const registeredEvents=[]; const documentListeners=new Map(); const dispatchedExtensionEvents=[]; let initCalls=0; let exitCalls=0; let windowCloseHandler=null; let newWindowRequestHandler=null;
  class HTMLAnchorElement {}
  const neutralino={init(){initCalls+=1;},events:{on(name,handler){registeredEvents.push(name); if(name==='windowClose')windowCloseHandler=handler; if(name==='newWindowRequest')newWindowRequestHandler=handler; return Promise.resolve();}},app:{exit(){exitCalls+=1; return Promise.resolve();}},extensions:{dispatch(extensionId,eventName,data){dispatchedExtensionEvents.push({extensionId,eventName,data}); return Promise.resolve();}}};
  const windowObject={Neutralino:neutralino}; const documentObject={addEventListener(name,handler){documentListeners.set(name,handler);}};
  const context=vm.createContext({window:windowObject,document:documentObject,HTMLAnchorElement,console:{error(...args){errors.push(args);}}});
  vm.runInContext(fs.readFileSync(PRELOAD_PATH,'utf8'),context);
  return {windowObject,errors,registeredEvents,documentListeners,dispatchedExtensionEvents,HTMLAnchorElement,getInitCalls:()=>initCalls,getExitCalls:()=>exitCalls,getWindowCloseHandler:()=>windowCloseHandler,getNewWindowRequestHandler:()=>newWindowRequestHandler};
}
const flushPromises=()=>new Promise((resolve)=>setImmediate(resolve));
test('Neutralino production pins the accepted runtime and identity',()=>{const config=readConfig(); assert.equal(config.applicationId,'com.santirodriguez.pikachuvolleyball.neutralino-spike'); assert.equal(config.cli.binaryName,'pikachu-volleyball-neutralino'); assert.equal(config.cli.binaryVersion,'6.9.0'); assert.equal(config.cli.clientVersion,'6.9.0'); assert.equal(config.port,48471); assert.equal(config.dataLocation,'system'); assert.deepEqual(config.nativeAllowList,['app.exit','extensions.dispatch','extensions.getStats']); assert.equal(config.logging.enabled,false); assert.equal(config.modes.window.enableInspector,false); assert.equal(config.modes.window.injectScript,'/resources/neutralino-preload.js');});
test('Neutralino production preserves the desktop window contract',()=>{const c=readConfig().modes.window; assert.equal(c.title,'Pikachu Volleyball'); assert.equal(c.width,1024); assert.equal(c.height,768); assert.equal(c.minWidth,800); assert.equal(c.minHeight,600); assert.equal(c.resizable,true); assert.equal(c.fullScreen,false); assert.equal(c.newWindowPolicy,'custom');});
test('Neutralino preload exposes only pvDesktop',async()=>{const h=createPreloadHarness(); assert.equal(h.getInitCalls(),1); assert.deepEqual(Object.keys(h.windowObject.pvDesktop).sort(),['isDesktop','quit','runtime']); assert.equal(h.windowObject.pvDesktop.runtime,'neutralino'); assert.equal(Object.isFrozen(h.windowObject.pvDesktop),true); const first=h.windowObject.pvDesktop.quit(); assert.equal(first,h.windowObject.pvDesktop.quit()); assert.equal(await first,true); h.getWindowCloseHandler()(); await flushPromises(); assert.equal(h.getExitCalls(),1); assert.deepEqual(h.errors,[]);});
test('Neutralino external requests remain mediated',async()=>{const h=createPreloadHarness(); const anchor=new h.HTMLAnchorElement(); anchor.href='https://santiagorodriguez.com/'; let prevented=false; h.documentListeners.get('click')({target:{closest:()=>anchor},preventDefault(){prevented=true;}}); await flushPromises(); assert.equal(prevented,true); assert.deepEqual(JSON.parse(JSON.stringify(h.dispatchedExtensionEvents)),[{extensionId:EXTERNAL_LINK_EXTENSION_ID,eventName:'openExternal',data:{url:'https://santiagorodriguez.com/'}}]); h.getNewWindowRequestHandler()({detail:{url:'https://santiagorodriguez.com'}}); await flushPromises(); assert.equal(h.dispatchedExtensionEvents.length,2);});
test('Neutralino production excludes validation privileges and probes',()=>{const config=readConfig(); const preload=fs.readFileSync(PRELOAD_PATH,'utf8'); assert.equal(config.nativeAllowList.includes('os.open'),false); assert.equal(config.nativeAllowList.includes('app.writeProcessOutput'),false); assert.equal(preload.includes('neutralino.os.open'),false); assert.equal(preload.includes('PV_NEUTRALINO_SMOKE'),false); assert.equal(fs.existsSync(path.join(ROOT,'desktop','neutralino','smoke-probe.js')),false);});
