import QRCode from 'qrcode';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runtimeConfig,root} from './config.mjs';
const options={errorCorrectionLevel:'M',margin:4,color:{dark:'#000000',light:'#ffffff'}};
export const qrSvg=url=>QRCode.toString(url,{...options,type:'svg'});
export async function exportQr(config,out=join(root,'exports')){
 const response=await fetch(config.submitUrl,{signal:AbortSignal.timeout(8000),redirect:'error'});
 if(!response.ok||!(response.headers.get('content-type')||'').includes('text/html'))throw Error(`二维码地址未通过访问检查：${response.status}`);
 await mkdir(out,{recursive:true});
 await QRCode.toFile(join(out,'submit-qr.png'),config.submitUrl,{...options,width:2400});
 await writeFile(join(out,'submit-qr.svg'),await qrSvg(config.submitUrl));
 await writeFile(join(out,'submit-url.txt'),config.submitUrl+'\n');
 return out;
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
 try{const c=runtimeConfig();console.log(`二维码：${c.submitUrl}\n导出：${await exportQr(c)}`);}catch(e){console.error(e.message);process.exitCode=1;}
}
