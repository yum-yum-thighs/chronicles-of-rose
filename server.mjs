import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)&&target!==path.join(root,'index.html')){res.writeHead(403);res.end();return;}fs.readFile(target,(e,b)=>{if(e){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});});
const port=Number(process.env.PORT||5199);
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
