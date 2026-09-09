import puppeteer from 'puppeteer-core';
import {writeFile} from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const failures=[];
try{const page=await browser.newPage();page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()});});await page.goto('http://127.0.0.1:5216/?lake360=1',{waitUntil:'networkidle0'});await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='开始对局')?.click());await new Promise(r=>setTimeout(r,1500));await writeFile('shots/lake360/resource-diagnostic.json',JSON.stringify(failures,null,2));console.log(failures);}finally{await browser.close();}
