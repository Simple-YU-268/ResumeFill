const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const configPath=process.env.RF_GATEWAY_CONFIG||path.join(process.env.APPDATA||path.join(require('node:os').homedir(),'.config'),'ResumeFillAgent','gateway','config.json');
fs.mkdirSync(path.dirname(configPath),{recursive:true});
if(!fs.existsSync(configPath)){const config={port:17321,token:crypto.randomBytes(32).toString('hex'),allowedExtensionIds:[],timeoutMs:20000,cacheTtlMs:300000,maxCacheEntries:128,upstream:{enabled:false,endpoint:'https://api.openai.com/v1/chat/completions',model:'',apiKey:'',jsonMode:true}};fs.writeFileSync(configPath,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});}
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));const connectionPath=path.join(path.dirname(configPath),'connection.json');fs.writeFileSync(connectionPath,JSON.stringify({kind:'resumefill-local-gateway',version:1,endpoint:`http://127.0.0.1:${config.port}/v1/chat/completions`,model:'resumefill-local',token:config.token},null,2),{mode:0o600});
console.log('配置文件：'+configPath);console.log('插件连接文件：'+connectionPath);console.log('默认本地规则模式；配置上游模型后才会调用 AI。令牌未输出。');
