const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {Controller} = require('./controller.cjs');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'rf-attachment-browser-'));
  const controller = new Controller(path.join(temp,'data'),path.join(__dirname,'resources'));
  const bytes = Buffer.from('%PDF-1.7\n% Synthetic upload fixture\n%%EOF\n');
  const original = path.join(temp,'fixture.pdf');
  fs.writeFileSync(original,bytes);
  controller.saveResumeAttachment(original);
  fs.unlinkSync(original);
  controller.config.port = 0;
  await controller.start();
  const fixture = http.createServer((req,res) => {
    res.setHeader('Content-Type','text/html;charset=utf-8');
    res.end('<form><label>姓名<input name="name"></label><label>个人简历<input type="file" accept=".pdf" hidden></label><button type="submit">提交</button></form><script>window.submissions=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submissions++};</script>');
  });
  await new Promise(resolve => fixture.listen(0,'127.0.0.1',resolve));
  const extension = path.join(temp,'extension');
  fs.cpSync(path.join(__dirname,'resources/extension'),extension,{recursive:true});
  fs.writeFileSync(path.join(extension,'desktop-connect.js'),'// Discovery is tested independently.');
  const manifest = JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(temp,'browser'),{
      ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {channel:process.env.BROWSER_CHANNEL || 'msedge'}),
      headless:true,args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`],
    });
    const manager = await context.newPage();
    await manager.goto('edge://extensions/');
    const id = await manager.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({},items => resolve(items.find(item => item.name.includes('ResumeFill'))?.id))));
    assert.ok(id);
    await manager.goto(`chrome-extension://${id}/options.html`);
    await manager.evaluate(async ({endpoint,token}) => {
      await chrome.storage.local.set({resume:{basics:{name:'Synthetic'},autoFill:{'basics.name':'review'}},autoAIEnabled:false,
        aiSettings:{enabled:true,endpoint,model:'resumefill-local',jsonMode:true}});
      await chrome.storage.session.set({aiApiKey:token});
    },{endpoint:`http://127.0.0.1:${controller.gateway.server.address().port}/v1/chat/completions`,token:controller.config.token});
    const metadata = await manager.evaluate(() => chrome.runtime.sendMessage({type:'RF_DESKTOP_RESUME_ATTACHMENT'}));
    assert.equal(metadata.fileName,'fixture.pdf');
    assert.equal(metadata.dataBase64,undefined);
    const target = await context.newPage();
    await target.goto(`http://127.0.0.1:${fixture.address().port}/`);
    const tabs = await manager.evaluate(() => chrome.tabs.query({}));
    const tab = tabs.find(item => item.url === target.url());
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.evaluate(tab => {chrome.tabs.query = async () => [tab];},tab);
    await popup.locator('#scan').click();
    await popup.locator('#summary').filter({hasText:'1 个字段'}).waitFor();
    const matching=popup.getByRole('combobox',{name:'姓名 对应简历字段',exact:true});
    assert.equal(await matching.inputValue(),'');
    await matching.selectOption('basics.name');
    await popup.locator('#fill').click();
    await popup.locator('#status').filter({hasText:'回读一致 1'}).waitFor();
    assert.equal(await target.locator('input[name=name]').inputValue(),'Synthetic');
    await popup.getByRole('button',{name:'选择已导入的 PDF',exact:true}).click();
    await popup.getByRole('button',{name:'确认附上 PDF',exact:true}).waitFor();
    assert.equal(await target.locator('input[type=file]').evaluate(el => el.files.length),0);
    await popup.getByRole('button',{name:'确认附上 PDF',exact:true}).click();
    await popup.locator('#status').filter({hasText:'已选中 PDF'}).waitFor();
    const selected = await target.locator('input[type=file]').evaluate(async el => ({name:el.files[0]?.name,bytes:[...new Uint8Array(await el.files[0].arrayBuffer())]}));
    assert.equal(selected.name,'fixture.pdf');
    assert.deepEqual(Buffer.from(selected.bytes),bytes);
    assert.equal(await target.evaluate(() => window.submissions),0);
    await manager.evaluate(async () => {
      await chrome.storage.local.set({applicationProgress:[{id:'synthetic-job',companyKey:'synthetic-company',
        origin:'https://jobs.example.test',at:1,updatedAt:2,status:'handoff',verified:2,failed:0,value:'private'}]});
      const result=await chrome.runtime.sendMessage({type:'RF_DESKTOP_HEARTBEAT'});
      if(result.error)throw Error(result.error);
    });
    assert.equal(controller.status().applications[0].status,'handoff');
    assert.ok(!JSON.stringify(controller.status().applications).includes('private'));
    controller.removeResumeAttachment();
    assert.equal(await manager.evaluate(() => chrome.runtime.sendMessage({type:'RF_DESKTOP_RESUME_ATTACHMENT'})),null);
    console.log('PASS: desktop-imported original PDF → authenticated metadata → explicit popup approval → hidden owned file input, exact bytes and no submission');
  } finally {
    await context?.close();
    await controller.stop();
    await new Promise(resolve => fixture.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
