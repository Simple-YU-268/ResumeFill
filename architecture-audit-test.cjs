// Synthetic architecture probes. Browser DOM is real; extension routing APIs
// are simulated here. Installed-extension coverage lives in iframe-browser-test.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const vm = require('node:vm'), assert = require('node:assert/strict');
const {chromium} = require('playwright');
const version = require('./package.json').version;
(async () => {
  const leaf = '<label>姓名<input id="candidate"></label>';
  const mokaBlock = title => `<section class="apply-block-synthetic"><div class="blockTitle-synthetic"><div>${title}</div></div><div class="apply-fields-synthetic"><div class="apply-field-synthetic"><div class="title-synthetic">公司名称</div><input></div></div></section>`;
  let otherOrigin;
  const serve = (req,res) => {
    res.setHeader('Content-Type','text/html;charset=utf-8');
    const routes = {
      '/leaf': leaf,
      '/same': '<iframe src="/leaf"></iframe>',
      '/nested': '<iframe src="/same"></iframe>',
      '/hidden': '<div hidden><iframe src="/leaf"></iframe></div>',
      '/cross': `<iframe src="${otherOrigin}/leaf"></iframe>`,
      '/srcdoc': '<iframe srcdoc="&lt;label&gt;姓名&lt;input&gt;&lt;/label&gt;"></iframe>',
      '/multiple': leaf+'<iframe src="/leaf"></iframe>',
      '/shadow': '<div id="open"></div><div id="closed"></div><script>for(const mode of ["open","closed"]){document.getElementById(mode).attachShadow({mode}).innerHTML="<label>姓名<input></label>";}</script>',
      '/editable': '<label id="title">自我评价</label><div contenteditable="true" aria-labelledby="title"></div>',
      '/moka-dual': mokaBlock('工作经历')+mokaBlock('实习经历'),
      '/moka-unknown': mokaBlock('求职意向'),
    };
    res.end(routes[req.url] || leaf);
  };
  const servers = [http.createServer(serve), http.createServer(serve)];
  for (const s of servers) await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const origin = 'http://127.0.0.1:'+servers[0].address().port;
  otherOrigin = 'http://127.0.0.1:'+servers[1].address().port;
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const results = [];
  try {
    for (const scenario of ['same','nested','hidden','cross','srcdoc','multiple','shadow','editable','moka-dual','moka-unknown']) {
      const page = await browser.newPage();
      try {
        await page.goto(origin+'/'+scenario);
        const frames = page.frames();
        for (const frame of frames) {
          await frame.evaluate(v=>{globalThis.chrome={runtime:{getManifest:()=>({version:v}),onMessage:{addListener:f=>globalThis.auditListener=f}}};},version);
          for(const file of ['profile.js','matcher.js','layout.js','adapters.js','controls.js','answers.js','content.js'])
            await frame.addScriptTag({path:path.join(__dirname,file)});
        }
        const storage = {}, chrome = {
          runtime:{getManifest:()=>({version})},
          storage:{session:{get:async k=>({[k]:storage[k]}),set:async o=>Object.assign(storage,o),remove:async k=>delete storage[k]}},
          tabs:{get:async()=>({url:page.url()}),sendMessage:async(id,message,route)=>frames[route.frameId].evaluate(m=>new Promise(r=>auditListener(m,{},r)),message)},
          scripting:{executeScript:async({target,func})=>Promise.all((target.frameIds || frames.map((_,i)=>i)).map(async i=>({frameId:i,documentId:'synthetic-'+i,result:await frames[i].evaluate(func)})))},
        };
        const sandbox = {chrome,URL}; sandbox.globalThis=sandbox;
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'page-bridge.js'),'utf8'),sandbox);
        let snapshot, error;
        try { snapshot=await sandbox.ResumePageBridge.scan(1,{type:'RF_SCAN',adapters:{version:1,adapters:[]}}); }
        catch(e){error=e.message;}
        if (scenario==='multiple'){assert.equal(snapshot.selectionRequired,true);assert.equal(snapshot.fields.length,0);const choice=snapshot.documents.find(d=>d.frameId===1);snapshot=await sandbox.ResumePageBridge.scan(1,{type:'RF_SCAN',documentId:choice.documentId,adapters:{version:1,adapters:[]}});assert.equal(snapshot.fields.length,1);}
        else {
          assert.equal(error,undefined);
          const expected = scenario==='moka-dual'?2:['same','nested','srcdoc','editable','moka-unknown'].includes(scenario)?1:0;
          assert.equal(snapshot.fields.length,expected,scenario);
          if (scenario==='editable') assert.equal(snapshot.fields[0].type,'contenteditable');
        }
        if(scenario==='cross' || scenario==='srcdoc') {
          const inner=await frames[1].evaluate(()=>new Promise(r=>auditListener({type:'RF_SCAN',adapters:{version:1,adapters:[]}}, {},r)));
          assert.equal(inner.fields.length,1,'inner DOM is scannable; bridge excludes its route');
        }
        if(scenario==='moka-dual') {
          const paths=await page.evaluate(fields=>fields.map(f=>ResumeMatcher.match(f,{'work.0.company':'Synthetic Employer'})?.path),snapshot.fields);
          assert.deepEqual(paths,[undefined,undefined]);
          results.push({scenario,result:'PASS',outcome:'work-and-internship-require-distinct-bindings'});
          continue;
        }
        if(scenario==='moka-unknown') assert.equal(snapshot.fields[0].contextBlocked,true);
        results.push({scenario,result:'PASS',outcome:error?'explicit-stop':snapshot.fields.length?'routed':'excluded'});
      } finally { await page.close(); }
    }
    console.log(JSON.stringify({version,environment:'synthetic Edge DOM; simulated extension APIs',results},null,2));
  } finally {
    await browser.close();
    for(const s of servers) await new Promise(r=>s.close(r));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
