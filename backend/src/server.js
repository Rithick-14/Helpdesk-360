import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { api } from './routes/api.js';
import { errors, notFound } from './middleware/errors.js';
import { db } from './db.js';
import { seed } from './seed.js';

dotenv.config({path:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../.env')});
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing. Copy .env.example to .env and set a secret.');
if (process.env.NODE_ENV==='production' && process.env.JWT_SECRET==='replace-this-placeholder-before-production') throw new Error('JWT_SECRET is still the placeholder. Set a private secret in .env before starting in production.');
if(process.env.SEED_DEMO!=='false') await seed();

export const app=express();
const allowedOrigin=process.env.CORS_ORIGIN||'http://localhost:5173';
app.disable('x-powered-by');
app.use(helmet({crossOriginResourcePolicy:{policy:'same-site'}}));
app.use(cors({origin:allowedOrigin,credentials:true}));
app.use(express.json({limit:'100kb'}));
app.use(cookieParser());
app.get('/health',(req,res)=>res.json({status:'ok'}));
app.use('/api',api);
app.use(notFound);
app.use(errors);

const currentFile=fileURLToPath(import.meta.url);
if(process.argv[1] && path.resolve(process.argv[1])===currentFile){
  const port=Number(process.env.PORT||4000);
  const server=app.listen(port,'0.0.0.0',()=>console.log(`HelpDesk API listening on http://localhost:${port}; SQLite: ${process.env.DB_PATH||'./data/helpdesk.sqlite'}`));
  const shutdown=()=>server.close(()=>{db.close();process.exit(0);});
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
