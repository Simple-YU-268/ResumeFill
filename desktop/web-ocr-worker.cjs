const path=require('node:path'),fs=require('node:fs');
let ocr;
process.on('message',async input=>{try{
 const modelPath=process.env.RF_OCR_DATA_PATH;if(!modelPath||!['eng','chi_sim','chi_tra'].every(lang=>fs.existsSync(path.join(modelPath,lang+'.traineddata.gz'))))throw Error('OCR 资源缺失');
 const {createWorker}=require('tesseract.js');ocr??=await createWorker(['chi_sim','chi_tra','eng'],1,{workerPath:require.resolve('tesseract.js/src/worker-script/node/index.js').replace(/app\.asar([\\/])/,'app.asar.unpacked$1'),langPath:modelPath,gzip:true,cacheMethod:'none'});
 const {createCanvas,loadImage}=require('@napi-rs/canvas');const scale=Math.min(2,Math.sqrt(12000000/(input.width*input.height))),canvas=createCanvas(Math.round(input.width*scale),Math.round(input.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(await loadImage(Buffer.from(input.base64,'base64')),0,0,canvas.width,canvas.height);await ocr.setParameters({tessedit_pageseg_mode:11});
 for(const mask of input.masks||[])ctx.fillRect(mask.x*canvas.width,mask.y*canvas.height,mask.width*canvas.width,mask.height*canvas.height);
 const result=await ocr.recognize(canvas.toBuffer('image/png'),{},{blocks:true});const words=[];let lineId=0;
 for(const block of result.data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){lineId++;for(const w of line.words||[]){if(words.length>=2000)break;if(typeof w.text==='string'&&w.text.trim()&&w.text.length<=100)words.push({text:w.text,confidence:Math.round(w.confidence),line:lineId,box:{x:w.bbox.x0/scale,y:w.bbox.y0/scale,width:(w.bbox.x1-w.bbox.x0)/scale,height:(w.bbox.y1-w.bbox.y0)/scale}});}}
 process.send({words,width:input.width,height:input.height,engine:'local-tesseract'});
}catch{if(process.connected)process.send({error:'本地网页 OCR 失败，请检查资源或缩小窗口后重试'});}});
process.on('disconnect',()=>process.exit());
