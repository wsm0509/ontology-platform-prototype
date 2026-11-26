const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname,'..');
function workspace() {
  const elements = new Map();
  const listeners = new Map();
  const element = () => ({innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){}},querySelector(){return null},querySelectorAll(){return []},focus(){}});
  const context = vm.createContext({console,structuredClone,Date,URL,Blob,setTimeout:()=>0,clearTimeout(){},location:{hash:''},history:{replaceState(){}},window:{scrollTo(){}},document:{title:'',activeElement:null,body:{style:{}},addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}}});
  for (const name of ['app.js','scene-system.js','deletion.js','graph-explorer.js']) vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context,{filename:name});
  context.assert = assert;
  context.dispatchTestEvent = (type,target) => {target.hasAttribute??=(name)=>name.startsWith('data-')&&Object.hasOwn(target.dataset||{},name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()));for(const listener of listeners.get(type)||[])listener({target});};
  return code => vm.runInContext(code,context);
}
module.exports = {workspace};
