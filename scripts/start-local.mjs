import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.env.WA_LIVE_ENABLED='false';
const port=Number(process.env.LOCAL_TEST_PORT||5173);
if(!Number.isInteger(port)||port<1024||port>65535){console.error('LOCAL_TEST_PORT must be 1024–65535');process.exit(1)}
try{
 const server=await createServer({file:path.join(root,'.local-test-data.json'),staticDir:path.join(root,'offline'),localTest:true});
 server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port '+port+' is busy. Stop the previous server or set LOCAL_TEST_PORT in .env.':'Local test server could not start.');process.exitCode=1});
 server.listen(port,'127.0.0.1',()=>console.log('Offline test workspace: http://127.0.0.1:'+port+'\nSeparate JSON data; MongoDB and WhatsApp Cloud disabled. Use synthetic records only.'));
}catch(e){console.error(e.message);process.exitCode=1}
