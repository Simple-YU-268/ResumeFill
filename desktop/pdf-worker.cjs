const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2],mode=process.argv[3]||'auto';
const send=data=>{if(process.connected)process.send(data);};
const progress=(phase,page=0,total=0,value=0)=>send({type:'progress',phase,page,total,progress:Math.max(0,Math.min(1,value))});
(async()=>{let parser,ocr,output;try{
 if(fs.statSync(file).size>15*1024*1024)throw Error('PDF 文件最大 15 MB');
 const {PDFParse}=require('pdf-parse');parser=new PDFParse({data:fs.readFileSync(file),isEvalSupported:false,disableFontFace:true,useSystemFonts:false});progress('reading');
 const info=await parser.getInfo();if(info.total>15)throw Error('PDF 最多支持 15 页，请仅导入简历部分');const pageInfo=await parser.getInfo({parsePageInfo:true});
 const result=await parser.getText(),texts=[],pageReport=[],warnings=[];
 for(let page=1;page<=info.total;page++){
  const native=(result.pages.find(p=>p.num===page)?.text||'').trim();const meaningful=native.replace(/\s/g,'').length;
  if(mode!=='force'&&meaningful>=80&&!/[\uFFFD]{3}/.test(native)){texts.push(native);pageReport.push({page,source:'text',characters:native.length});continue;}
  if(!ocr){progress('models',page,info.total);const modelPath=process.env.RF_OCR_DATA_PATH;if(!modelPath||!['eng','chi_sim','chi_tra'].every(lang=>fs.existsSync(path.join(modelPath,lang+'.traineddata.gz'))))throw Error('本地 OCR 语言包缺失，请重新安装完整版');
   const {createWorker}=require('tesseract.js');const workerPath=require.resolve('tesseract.js/src/worker-script/node/index.js').replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
   let currentPage=page;ocr=await createWorker(['chi_sim','chi_tra','eng'],1,{workerPath,langPath:modelPath,gzip:true,cacheMethod:'none',logger:m=>{if(m.status==='recognizing text')progress('ocr',currentPage,info.total,m.progress);}});ocr.setCurrentPage=p=>{currentPage=p;};
  }
  const dimensions=pageInfo.pages.find(p=>p.pageNumber===page);if(!dimensions||dimensions.width<=0||dimensions.height<=0||1700*1700*dimensions.height/dimensions.width>9000000)throw Error('PDF 页面尺寸过大，请缩小后重试');
  ocr.setCurrentPage(page);progress('rendering',page,info.total);const screenshot=await parser.getScreenshot({partial:[page],desiredWidth:1700,imageBuffer:true,imageDataUrl:false});const image=screenshot.pages[0];
  if(!image||image.width*image.height>9000000)throw Error('PDF 页面尺寸过大，请缩小后重试');
  progress('ocr',page,info.total);const recognized=await ocr.recognize(Buffer.from(image.data));const scanned=recognized.data.text.trim(),confidence=Math.round(recognized.data.confidence||0);
  const text=scanned;texts.push(text);pageReport.push({page,source:'ocr',confidence,characters:text.length});
  if(confidence<70||text.replace(/\s/g,'').length<30)warnings.push(`第 ${page} 页 OCR 识别可能不完整，请对照原 PDF 核对姓名、号码、日期及经历。`);
 }
 const text=texts.join('\n\n').trim();if(text.length<30)throw Error('OCR 未识别到足够文字，请使用更清晰、方向正确的简历');if(text.length>60000)throw Error('简历文字过长，请精简至 60000 字符内');
 output={text,pages:info.total,ocrPages:pageReport.filter(p=>p.source==='ocr').length,pageReport,warnings};
}catch(e){output={error:/PDF 最多|PDF 文件|本地 OCR|OCR 未|简历文字|页面尺寸/.test(e.message)?e.message:'PDF 读取或本地 OCR 失败，文件可能已加密、损坏或格式不受支持'};}
finally{try{await ocr?.terminate();}catch{}try{await parser?.destroy();}catch{}if(process.connected)process.send(output,()=>process.disconnect());}})();
