import express from 'express';
import {createApp} from './server.mjs';
const app=express();app.disable('x-powered-by');const core=await createApp();app.use(core.handler);app.listen(Number(process.env.PORT)||5173,'127.0.0.1',()=>console.log('Prakshal Connect (Express) ready'));
