const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const svg=fs.readFileSync('lanyard-misto-vett.svg','utf8');
await p.setContent('<style>@page{size:429mm 24mm;margin:0}html,body{margin:0}svg{display:block}</style><body>'+svg+'</body>');
await p.pdf({path:'lanyard-misto-VETTORIALE-RGB.pdf',width:'429mm',height:'24mm',printBackground:true,pageRanges:'1'});
await b.close()})();
