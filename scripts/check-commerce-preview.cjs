const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE);
const fs=require('node:fs');
(async()=>{
 console.log('Starting local browser verification.');
 const browser=await chromium.launch({headless:true,timeout:15000});
 let page;
 try{
  page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8810/membership',{waitUntil:'domcontentloaded',timeout:30000});
  await page.getByText('Plebba Kóngur',{exact:true}).waitFor({timeout:120000});
  fs.mkdirSync('tmp',{recursive:true});
  await page.screenshot({path:'tmp/membership-preview.png',fullPage:true});
  await page.getByRole('button',{name:'Prófa í sýniham'}).last().click();
  await page.getByRole('button',{name:'Veski',exact:true}).click();
  await page.getByRole('button',{name:'Bæta við prufuinneign'}).waitFor();
  await page.screenshot({path:'tmp/wallet-preview.png',fullPage:true});
  await page.getByRole('button',{name:'Bæta við prufuinneign'}).click();
  await page.getByRole('button',{name:'Skoða úttekt'}).click();
  await page.getByRole('button',{name:'Staðfesta prufuúttekt'}).waitFor();
  await page.screenshot({path:'tmp/withdrawal-preview.png',fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('PASS: mobile-width membership, Premium demo grant, wallet purchase and withdrawal quote render without runtime errors.');
 }catch(error){if(page){console.log((await page.locator('body').innerText()).slice(0,2000));await page.screenshot({path:'tmp/commerce-preview-error.png',fullPage:true});}throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
