// Optional integration probe against operator-supplied, digest-pinned public assets.
// No vendor code or website data is stored in the repository or release runtime.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),assets=[
 {env:'RF_LAYUI_BUNDLE',hash:'fef3fe945718e6caef2f72dc7c89080374cfd74e59576746e477de017c1ef0ad'},
 {env:'RF_LAYUI_CSS',hash:'7e90b7ced175894e5737acf791e4f77d2d3223e85d15c81b2485f1c525730987'}
];
(async()=>{for(const asset of assets){if(!process.env[asset.env])throw Error('Set '+asset.env+' to the documented local asset path');asset.file=path.resolve(process.env[asset.env]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(asset.file)).digest('hex'),asset.hash,'Unexpected vendor asset digest: '+asset.env);}
 const b=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{
 for(const search of [false,true])for(const redraw of [false,true]){
  const p=await b.newPage();await p.route('**/*',route=>route.abort());await p.setContent('<form class="layui-form">'+[['nation','民族','汉族'],['politics','政治面貌','共青团员'],['employment','人员状态','在职']].map(([id,label,text])=>`<div class="form-item"><label>${label}</label><select id="${id}" lay-filter="fixture" ${search?'lay-search':''}><option value="">请选择${label}</option><option value="choice">${text}</option></select></div>`).join('')+'<div class="form-item"><label>性别</label><select disabled><option value="">请选择</option><option value="m">男</option></select></div></form>');
  await p.addStyleTag({path:assets[1].file});await p.addScriptTag({path:assets[0].file});await p.evaluate(redraw=>new Promise(resolve=>layui.use('form',()=>{layui.form.render();if(redraw)layui.form.on('select(fixture)',()=>setTimeout(()=>layui.form.render('select'),250));resolve();})),redraw);
  for(const f of ['profile.js','matcher.js','layout.js','controls.js','adapters.js'])await p.addScriptTag({path:path.join(root,f)});await p.evaluate(()=>globalThis.chrome={runtime:{onMessage:{addListener:fn=>globalThis.listener=fn}}});await p.addScriptTag({path:path.join(root,'content.js')});
  const snapshot=await p.evaluate(()=>new Promise(resolve=>listener({type:'RF_SCAN',adapters:{version:1,adapters:[]}}, {},resolve)));assert.equal(snapshot.fields.length,3,'Disabled native source must not be scanned through its visible proxy');
  const result=await p.evaluate(fields=>new Promise(resolve=>listener({type:'RF_FILL',overwrite:true,items:fields.map((f,i)=>({id:f.id,value:['汉族','共青团员','在职'][i]}))},{},resolve)),snapshot.fields);assert.deepEqual(result.results.map(r=>r.status),['verified','verified','verified']);assert.deepEqual(await p.locator('select:not(:disabled)').evaluateAll(es=>es.map(e=>e.value)),['choice','choice','choice']);assert.deepEqual(await p.locator('select:not(:disabled) + .layui-form-select .layui-select-title input').evaluateAll(es=>es.map(e=>e.value)),['汉族','共青团员','在职']);await p.close();
 }
 console.log('PASS: digest-pinned website Layui JS/CSS; four actual-component batch scenarios (search/plain × redraw/static), native/display readback and disabled-proxy omission; all network requests blocked');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
