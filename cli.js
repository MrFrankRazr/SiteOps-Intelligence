import {readFile,writeFile} from 'node:fs/promises';
import {scan,compare} from './engine.js';
const [action,url,filepath] = process.argv.slice(2);
if(!['baseline','compare'].includes(action) || !url || !filepath){
  console.error('Usage: node scanner/cli.js baseline https://example.com baseline.json');
  console.error('   or: node scanner/cli.js compare https://example.com baseline.json');
  process.exit(2);
}
try {
  const result=await scan(url);
  if(action==='baseline'){
    await writeFile(filepath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('Saved baseline:',filepath,'status:',result.status);
  }else{
    const before=JSON.parse(await readFile(filepath,'utf8'));
    if(new URL(before.requestedUrl).href !== new URL(url).href) throw new Error('Baseline URL does not match requested URL');
    console.log(JSON.stringify(compare(before,result),null,2));
  }
}catch(e){console.error('Scan failed:',e.message);process.exitCode=1;}
