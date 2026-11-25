import {lookup} from 'node:dns/promises';
import https from 'node:https';
const version=process.versions.node.split('.').map(Number);
if(version[0]<20||(version[0]===20&&version[1]<19)||(version[0]===22&&version[1]<12)||version[0]===21){console.error('Use Node.js 22 LTS (22.12+) or a supported newer LTS.');process.exit(1)}
console.log('Node:',process.version);
const timer=setTimeout(()=>{console.error('Registry check timed out. Check DNS, internet, proxy or firewall.');process.exit(1)},12000);
try{const host=await lookup('registry.npmjs.org');console.log('Registry DNS:',host.address);await new Promise((resolve,reject)=>{const req=https.get('https://registry.npmjs.org/-/ping',res=>{res.resume();res.on('end',()=>res.statusCode===200?resolve():reject(Error('HTTP '+res.statusCode)))});req.on('error',reject);req.setTimeout(8000,()=>req.destroy(Error('HTTPS timeout')))});console.log('Registry reachable. Run npm install.')}catch(e){console.error('Registry connection failed:',e.code||e.message);process.exitCode=1}finally{clearTimeout(timer)}
