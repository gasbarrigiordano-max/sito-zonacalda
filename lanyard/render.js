const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();
const svg=fs.readFileSync('lanyard-'+process.argv[2]+'.svg','utf8');
const w=429,h=24,px=w/25.4*300; // 300 dpi
const p=await b.newPage({viewport:{width:Math.round(px),height:Math.round(h/25.4*300)}});
await p.setContent('<body style="margin:0;background:#000">'+svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/,'width="100%" height="100%"')+'</body>');
await p.screenshot({path:'lanyard-'+process.argv[2]+'-300dpi.png'});
await b.close()})();
